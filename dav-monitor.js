const assert = require('assert');
const Promise = require('bluebird');
const request = Promise.promisify(require("request"));
const slack = require('./slack');

module.exports = () => Promise.try(() => {
	return request('https://dav.eeic.jp/dav/private/eeic2017/hakatashi/dav-status.json', {
		auth: {
			user: 'eeic',
			pass: process.env.DAV_PASSWORD,
			sendImmediately: false, // digest auth
		},
		json: true,
		timeout: 5000,
	});
}).then((response) => {
	const data = response.body;

	assert(data);
	assert.strictEqual(data.status, 'OK');
}).catch((error) => {
	slack.send({
		text: '@channel dav.eeic.jp seems down!',
		channel: '#server',
		username: 'dav-monitor',
		attachments: [{
			color: 'danger',
			title: error.message,
			text: error.stack,
		}],
	});
});
