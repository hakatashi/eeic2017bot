const slack = require('./slack');
const getWiki = require('./wiki');

getWiki.then((wiki) => {
	slack.send({text: 'hello'});
	return wiki.getAllPagesAsync();
}).then((pages) => {
	console.log(pages);
});;
