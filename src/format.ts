const h2p = require('html2plaintext');

export function htmlToPlainText(html:string):string {
	var text = '';
	if (html) {
		var pres = html.match(/<pre>[\s\S]*?<\/pre>/gi);
		if (pres) {
			for (var j = 0; j < pres.length; j++) {
				html = html.replace(pres[j], pres[j].replace(/\n/g, "<br/>\n"));
			}
		}
		text = h2p(html);
	}
	return text;
}
