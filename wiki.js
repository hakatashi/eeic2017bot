const nodemw = require('nodemw');
const Promise = require('bluebird');

const wiki = new nodemw({
	protocol: 'https',
	server: 'wiki.eeic.jp',
	path: '',
	debug: true,
});

Promise.promisifyAll(wiki);

module.exports = new Promise((resolve, reject) => {
	wiki.logInAsync('eeic2017bot', process.env.WIKI_PASSWORD).then(() => {
		resolve(wiki);
	}).catch((error) => {
		reject(error);
	});
});
