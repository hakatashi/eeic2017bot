const nodemw = require('nodemw');
const Promise = require('bluebird');

const wiki = new nodemw({
	protocol: 'https',
	server: 'wiki.eeic.jp',
	path: '',
	debug: true,
});

Promise.promisifyAll(wiki);

wiki.logInAsync('eeic2017bot', process.env.WIKI_PASSWORD).then(() => (
	wiki.getAllPagesAsync()
)).then((pages) => {
	console.log(pages);
});
