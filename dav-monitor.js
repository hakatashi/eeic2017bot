const assert = require('assert');
const Promise = require('bluebird');
const request = Promise.promisify(require("request"));
const slack = require('./slack');
const redis = require('./redis');
const {currentMinute} = require('./time');

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

	return redis.getAsync('dav_status');
}).then((davStatus) => {
	if (davStatus === 'false') {
		console.log('dav status: FIXED');

		slack.send({
			text: 'dav.eeic.jp is now fixed! :raised_hands:',
			channel: '#server',
			username: 'dav-monitor',
			attachments: [{
				color: 'good',
				title: 'Status OK',
			}],
		});
	} else {
		console.log('dav status: UP');
	}

	return redis.setAsync('dav_status', 'true');
}).catch((error) => {
	Promise.try(() => {
		return redis.getAsync('dav_status');
	}).then((davStatus) => {
		if (davStatus !== 'false') {
			console.log('dav status: WENT DOWN');

			slack.send({
				text: '<!channel> dav.eeic.jp seems down!',
				channel: '#server',
				username: 'dav-monitor',
				attachments: [{
					color: 'danger',
					title: error.message,
					text: error.stack,
				}],
			});
		} else if (currentMinute === 0) {
			console.log('dav status: STILL DOWN (notify)');

			slack.send({
				text: 'dav.eeic.jp is still down!',
				channel: '#server',
				username: 'dav-monitor',
				attachments: [{
					color: 'danger',
					title: error.message,
					text: error.stack,
				}],
			});
		} else {
			console.log('dav status: STILL DOWN');
		}

		return redis.setAsync('dav_status', 'false');
	});
});
