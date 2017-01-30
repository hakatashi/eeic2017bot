module.exports = {
	currentHour: Math.floor(Math.round(Date.now() / (10 * minute)) % (6 * 24) / 6 + 9),
	currentMinute: Math.round(Date.now() / (10 * minute)) % 6 * 10,
};
