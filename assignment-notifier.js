const moment = require('moment-timezone');
const assert = require('assert');
const Promise = require('bluebird');
const getUrls = require('get-urls');
const https = require('https');

const slack = require('./slack');
const getWiki = require('./wiki');
const redis = require('./redis');

const now = moment.tz('Asia/Tokyo');
const today = now.clone().startOf('date');

module.exports = () => Promise.try(() => {
	return getWiki;
}).then((wiki) => (
	Promise.all([
		wiki.getArticleAsync('EEIC2017/課題一覧'),
		redis.getAsync('notified_daily_reminder'),
		redis.getAsync('notified_weekly_reminder'),
	])
)).then(([page, notifiedDailyReminder, notifiedWeeklyReminder]) => {
	let h2 = null;
	let h3 = null;
	let dueDate = null;
	let dueTime = null;
	let content = '';

	const notifiedDailyReminderTime = moment(notifiedDailyReminder || 0);
	const notifiedWeeklyReminderTime = moment(notifiedWeeklyReminder || 0);

	const dailyReminderLastDue = today.clone().hour(17).isAfter(now) ?
		today.clone().subtract(1, 'day').hour(17) :
		today.clone().hour(17);
	const weeklyReminderLastDue = today.clone().startOf('week').day(6).hour(10).isAfter(now) ?
		today.clone().startOf('week').subtract(1, 'week').day(6).hour(10) :
		today.clone().startOf('week').day(6).hour(10);
	console.log({
		notifiedWeeklyReminder,
		notifiedDailyReminder,
		dailyReminderLastDue,
		weeklyReminderLastDue,
	});

	const assignments = [];

	const pushAssignment = () => {
		if (h2 !== null && h3 !== null && dueDate !== null && dueTime !== null) {
			const urls = getUrls(content);
			const imageUrl = urls.find(url => url.match(/(png|jpg|jpeg|bmp|gif)/));

			assignments.push({
				h2, h3, dueDate, dueTime,
				content: content.trim(),
				id: `${h2}###${h3}`,
				imageUrl: imageUrl ? encodeURI(imageUrl) : undefined,
			});
		}

		dueDate = dueTime = null;
		content = '';
	};

	page.split('\n').forEach((line) => {
		let match;

		if (match = line.match(/^==([^=]+)==$/)) {
			pushAssignment();

			const heading = match[1].trim();
			if (match = heading.match(/^\[\[.+\|(.+)\]\]$/)) {
				h2 = match[1];
			} else {
				h2 = heading;
			}

			h3 = null;
		} else if (match = line.match(/^===([^=]+)===$/)) {
			pushAssignment();
			h3 = match[1].trim();
		} else if (match = line.match(/^\*([^*]+?):(.+)$/)) {
			const [name, value] = [match[1], match[2]].map(part => part.trim());

			if (name === '期日') {
				dueDate = value;
			} else if (name === '期限') {
				dueTime = value;
			}
		} else {
			content += `${line}\n`;
		}
	});

	pushAssignment();

	assert(assignments.length > 5);
	console.log({assignments});

	return redis.saddAsync('temp', ...assignments.map(it => it.id)).then(() => (
		Promise.all([
			redis.existsAsync('notified_assignments'),
			redis.sdiffAsync('temp', 'notified_assignments'),
			redis.sdiffAsync('notified_assignments', 'temp'),
		])
	)).then(([keyExists, additions, deletions]) => {
		if (keyExists) {
			const attachments = [];

			attachments.push(...additions.map((id) => {
				const assignment = assignments.find(it => it.id === id);
				const dueDate = moment.tz(assignment.dueDate, 'Asia/Tokyo');
				const daysToDue = dueDate.diff(now, 'days');
				const title = `新規登録: ${assignment.h2} ${assignment.h3}: ${daysToDue}日後(${assignment.dueDate})`;

				const color = (() => {
					if (daysToDue <= 3) {
						return 'warning';
					} else {
						return 'good';
					}
				})();

				return {
					color,
					title,
					fallback: title,
					text: assignment.content,
					image_url: assignment.imageUrl,
				};
			}));

			attachments.push(...deletions.map((id) => {
				const [h2, h3] = id.split('###');
				const title = `削除: ${h2} ${h3}`;

				return {
					color: 'danger',
					title,
					fallback: title,
				};
			}));

			if (attachments.length > 0) {
				slack.send({
					text: '課題情報を更新しました!',
					attachments,
				});
			}
		}

		return redis.delAsync('notified_assignments');
	}).then(() => {
		return redis.renameAsync('temp', 'notified_assignments');
	}).then(() => (
		// ping healthcheck.io
		new Promise((resolve, reject) => {
			https.get(process.env.HEALTHCHECK_ASSIGNMENT_CRON_URL, (res) => {
				if (res.statusCode === 200) {
					resolve();
				} else {
					reject(new Error('Healthcheck status isnt 200'));
				}
			});
		})
	)).then(() => {
		// Notify tomorrow's assignments at 17:00
		if (notifiedDailyReminderTime.isBefore(dailyReminderLastDue)) {
			const attachments = [];

			assignments.forEach((assignment) => {
				const dueDate = moment.tz(assignment.dueDate, 'Asia/Tokyo');
				const daysToDue = dueDate.diff(today, 'days');

				if (daysToDue === 1) {
					const title = `「${assignment.h2} ${assignment.h3}」は明日の${assignment.dueTime}が期限です!`;
					attachments.push({
						color: 'warning',
						title,
						fallback: title,
						text: assignment.content,
						image_url: assignment.imageUrl,
					});
				}
			});

			if (attachments.length > 0) {
				slack.send({
					text: '明日が期限の課題ですよ～',
					attachments,
				});
			}

			return redis.setAsync('notified_daily_reminder', now.toISOString()).then(() => (
				new Promise((resolve, reject) => {
					https.get(process.env.HEALTHCHECK_ASSIGNMENT_NOTIFICATION_URL, (res) => {
						if (res.statusCode === 200) {
							resolve();
						} else {
							reject(new Error('Healthcheck status isnt 200'));
						}
					});
				})
			));
		}

		// Notify next week's assignments at 10:00 Saturday
		if (notifiedWeeklyReminderTime.isBefore(weeklyReminderLastDue)) {
			const attachments = [];

			assignments.forEach((assignment) => {
				const dueDate = moment.tz(assignment.dueDate, 'Asia/Tokyo');
				const daysToDue = dueDate.diff(today, 'days');
				const dueDateString = dueDate.locale('ja').format('MM/DD (ddd)')

				if (0 <= daysToDue && daysToDue <= 6) {
					const title = `【${dueDateString} ${assignment.dueTime}】${assignment.h2} ${assignment.h3}`;
					attachments.push({
						color: 'good',
						title,
						fallback: title,
						text: assignment.content,
						image_url: assignment.imageUrl,
						dueDateUnix: dueDate.unix(),
					});
				}
			});

			if (attachments.length > 0) {
				slack.send({
					text: '来週の課題一覧です:notes:',
					attachments: attachments.sort((a, b) => a.dueDateUnix - b.dueDateUnix),
				});
			}

			return redis.setAsync('notified_weekly_reminder', now.toISOString()).then(() => (
				new Promise((resolve, reject) => {
					https.get(process.env.HEALTHCHECK_ASSIGNMENT_WEEKLY_URL, (res) => {
						if (res.statusCode === 200) {
							resolve();
						} else {
							reject(new Error('Healthcheck status isnt 200'));
						}
					});
				})
			));
		}
	});
});
