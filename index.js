var Evernote = require('evernote').Evernote;
var request = require('request');
var jsdom = require('jsdom');
var _ = require('lodash');

var sampleURLs = [
	'http://www.bucataras.ro/retete/tort-himalaya-55753.html',
];

var app = {
	readabilityToken: '9302d3caae0200e4cfe35258cd7f0f1e05447779',
	readabilityURL: 'http://www.readability.com/api/content/v1/parser?url={url}&token={token}',
	evernoteToken: "S=s1:U=8e2e0:E=14c315271c9:C=144d9a145cb:P=1cd:A=en-devtoken:V=2:H=361c1b26128a45d0ae40ca7950e04649",

	forbiddenAttributes: [
		'id','class','onclick','ondblclick','onclick','ondblclick','onmousedown',
		'onmousemove','onmouseover','onmouseout','onmouseup','onkeydown',
		'onkeypress','onkeyup','onabort','onerror','onload','onresize',
		'onscroll','onunload','onblur','onchange','onfocus','onreset',
		'onselect','onsubmit','accesskey','data','dynsrc','tabindex',
	],
	forbiddenElements: [
		'applet','base','basefont','bgsound','blink','button','dir',
		'embed','fieldset','form','frame','frameset','iframe',
		'ilayer','input','isindex','label','layer','legend','link','marquee',
		'menu','meta','noframes','noscript','object','optgroup','option',
		'param','plaintext','script','select','style','textarea','xml',
	],
	permittedElements: [
		'html', 'head', 'body',
		'a','abbr','acronym','address','area','b','bdo','big','blockquote',
		'br','caption','center','cite','code','col','colgroup','dd','del',
		'dfn','div','dl','dt','em','font','h1','h2','h3','h4','h5','h6','hr',
		'i','img','ins','kbd','li','map','ol','p','pre','q','s','samp',
		'small','span','strike','strong','sub','sup','table','tbody','td',
		'tfoot','th','thead','title','tr','tt','u','ul','var','xmp',
	],

	client: null,
	init: function() {
		app.readabilityURL = app.readabilityURL.replace('{token}', app.readabilityToken);
		app.client = new Evernote.Client({
			token: app.evernoteToken, 
			sandbox: true
		});
		app.noteStore = app.client.getNoteStore();
		app.permittedElements = _.map(app.permittedElements, function(name) {
			return name.toUpperCase();
		});
	},
	run: function() {
		app.getContent(sampleURLs[0], function(response) {
			app.createNote(response.content, response.title, null, function(note) {console.log('note created');});
		});
	},
	getContent: function(url, callback) {
		console.log(app.readabilityURL.replace('{url}', encodeURIComponent(url)));
		request(app.readabilityURL.replace('{url}', encodeURIComponent(url)), function(error, response, body) {
			if(error) return console.error(error);
			callback(JSON.parse(body));
		});
	},
	createNote: function(noteBody, noteTitle, parentNotebook, callback) {
		start = '<html><head></head><body>';
		end = '</body></html>';
		noteBody = start + noteBody + end;
		var document = jsdom.jsdom(noteBody);
		var window = document.parentWindow;

		jsdom.jQueryify(window, "http://code.jquery.com/jquery.js", function () {
			var $ = window.$;

			_.each(app.forbiddenElements, function(el) {
				$(el).remove();
			});

			_.each(app.forbiddenAttributes, function(attr) {
				$('*').removeAttr(attr);
			});

			var getUnknownTags = function() {
				return _.filter(
					_.uniq(_.map($('*'), function(node) { 
						return node.nodeName; 
					})),
					function(tagName) {
						return app.permittedElements.indexOf(tagName) === -1;
					}
				);
			};

			var replaceTag = function(unknownTag) {
				$(unknownTag).replaceWith(function() { 
					return $('<div/>', {
						html: this.innerHTML
					}); 
				});
			};

			var unkownTags = getUnknownTags();

			while(unkownTags.length) {
				_.each(
					unkownTags,
					replaceTag
				);
				unkownTags = getUnknownTags();
			}

			noteBody = $('body').html();
			console.log(noteBody);

			var nBody = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
			nBody += "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">";
			nBody += "<en-note>" + noteBody + "</en-note>";

			// Create note object
			var ourNote = new Evernote.Note();
			ourNote.title = noteTitle;
			ourNote.content = nBody;

			// parentNotebook is optional; if omitted, default notebook is used
			if (parentNotebook && parentNotebook.guid) {
				ourNote.notebookGuid = parentNotebook.guid;
			}

			// Attempt to create note in Evernote account
			app.noteStore.createNote(ourNote, function(err, note) {
				if (err) {
					// Something was wrong with the note data
					// See EDAMErrorCode enumeration for error code explanation
					// http://dev.evernote.com/documentation/reference/Errors.html#Enum_EDAMErrorCode
					console.error(err);
				} else {
					callback(note);
				}
			});
		});
	}
};

app.init();
app.run();

