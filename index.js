"use strict";

const csv = require("csv-parser");
const fs = require("fs");
const root = require("app-root-path");
const path = require("path");
const JSON5 = require("json5");
const moment = require("moment");
const { MessageType, WAConnection } = require("@adiwajshing/baileys");
const Logger = require("./logger");

// Required for kill process
process.title = "wpautomsg";

// Handle process exit
process.on("exit", () => {
	console.log(`App specific shutdown detected. Stack:\n${console.trace()}`);
});
// Catch CTRL + C event
process.on("SIGINT", () => {
	console.log("Console break shutdown detected.");
	process.exit(2);
});
// Catch unhandled rejection
// @param {Object} err - Error object
process.on("unhandledRejection", (err) => {
	console.log(err);
	process.exit(3);
});

// Read CSV database file
// @param {String} file - File path
// @param {function} onData - Callback function
// @param {function} onEnd - Callback function
// @return {promise} - Promise object
function readCSVDatabase(file, onData, onEnd) {
	return new Promise((resolve, reject) => {
		fs.createReadStream(file)
			.pipe(csv({
				separator: ","
			}))
			.on("data", (data) => {
				onData(data);
			})
			.on("end", () => {
				onEnd();
				resolve();
			})
			.on("error", (err) => {
				reject(err);
			});
	});
}

// Read JSON database file
// @param {String} file - File path
// @return {promise} - Promise object
function readJSONDatabase(file) {
	return new Promise((resolve, reject) => {
		fs.readFile(file, "utf8", (err, jobsRawData) => {
			if (err) {
				logger.error(err);
				reject(err);
			}
			try {
				resolve(jobsRawData);
			}
			catch (err) {
				logger.error(err);
				reject(err);
			}	
		});
	});
}

// Timer counter
var __timerCount;

// ETA(Epoch time) based timer
// @param {Number} eta - ETA in milliseconds
// @param {Object} ctx - Context object
// @return {promise} - Promise object
function customTimer(targetDate, ctx){
	return new Promise((resolve, reject) => {
		let timer = setTimeout(() => {
			global.__timerCount--;
			resolve(ctx);
		}, targetDate - Date.now());

		global.__timerCount++;
		logger.info(`Timer successfully scheduled! Timer count: ${global.__timerCount}`);
	});
}

// Application main routine
function appMainRoutine() {
	// Initialize global variables
	global.__timerCount = 0;

	// Create logger
	const log = new Logger();
	log.initialize();

	// Keep alive
	process.stdin.resume();
	// Set encoding
	process.stdin.setEncoding("utf8");
	// Handle exit input
	process.stdin.on("data", (data) => {
		if (data.toString().trim() === "exit") {
			process.exit(0);
		}
	});

	// Declare variables
	const phonebook = [];
	const messages = [];
	const jobs = [];

	// Check is required files exist
	const phonebookFile = `${root}${path.sep}phonebook.csv`;
	if (!fs.existsSync(phonebookFile)) {
		logger.error("Phonebook file not found.");
		process.exit(1);
	}
	const messagesFile = `${root}${path.sep}messages.csv`;
	if (!fs.existsSync(messagesFile)) {
		logger.error("Messages file not found.");
		process.exit(1);
	}
	const jobsFile = `${root}${path.sep}jobs.json`;
	if (!fs.existsSync(jobsFile)) {
		logger.error("Jobs file not found.");
		process.exit(1);
	}

	// Read phonebook database
	readCSVDatabase(
		phonebookFile,
		(data) => {
			if (!data.ID) {
				logger.error(`Invalid phonebook entry, missing ID!`);
				process.exit(1);
			} else if (!data.Phone) {
				logger.error(`Invalid phonebook entry, missing Phone number!`);
				process.exit(1);
			} else if (phonebook.find(x => x.phone === data.Phone)) {
				logger.error(`Duplicate phonebook entry, ID: ${data.ID}, Phone: ${data.Phone}`);
				process.exit(1);
			} else if (data.Phone.match(/\d/g).length !== 12) {
				logger.error(`Invalid phonebook entry, Phone number is invalid!`);
				process.exit(1);
			}
			phonebook.push({ type: "local", id: data.ID, phone: data.Phone });					
		},
		() => {
			logger.info(`Phonebook file read. ${phonebook.length} entries.`);

			if (!phonebook.length) {
				logger.error("Phonebook is empty.");
				process.exit(1);
			}
		}
	).catch((err) => {
		logger.error(err);
		process.exit(1);
	}).then(() => {
		// Read messages database
		readCSVDatabase(
			messagesFile,
			(data) => {
				messages.push(data.Message);
			},
			() => {
				logger.info(`Messages file read. ${messages.length} entries.`);

				if (!messages.length) {
					logger.error("Messages are empty.");
					process.exit(1);
				}
			}
		) .catch((err) => {
			logger.error(err);
			process.exit(1);
		}).then(() => {
			// Read jobs database
			readJSONDatabase(jobsFile)
				.then((jobsRawData) => {
					const jobsData = JSON5.parse(jobsRawData);
					const jobsLength = Object.keys(jobsData).length;
					logger.info(`Jobs file read. ${jobsLength} entries.`);
			
					if (!jobsLength) {
						logger.error("Jobs are empty.");
						process.exit(1);
					}
					
					const jobsContext = Object.values(jobsData);
					for (let i = 0; i < jobsLength; i++) {
						const jobContext = jobsContext[i];
						if (!jobContext.message) {
							logger.error(`Invalid job entry, missing message!`);
							process.exit(1);
						} else if (!jobContext.contacts) {
							logger.error(`Invalid job entry, missing contacts!`);
							process.exit(1);
						} else if (!jobContext.date) {
							logger.error(`Invalid job entry, missing date!`);
							process.exit(1);
						} else if (!jobContext.contacts.length) {
							logger.error(`Invalid job entry, contacts are empty!`);
							process.exit(1);
						} else if (jobContext.message > Object.keys(messages).length) {
							logger.error(`Invalid job entry, message index is out of range!`);
							process.exit(1);
						} else if (jobContext.date.length < 2) {
							logger.error(`Invalid job entry, date is invalid!`);
							process.exit(1);
						} else if (jobContext.date[0] < 0 || jobContext.date[0] > 23) {
							logger.error(`Invalid job entry, date[0] is invalid!`);
							process.exit(1);
						} else if (jobContext.date[1] < 0 || jobContext.date[1] > 59) {
							logger.error(`Invalid job entry, date[1] is invalid!`);
							process.exit(1);
						} else if (typeof(jobContext.contacts) != "object" && typeof(jobContext.contacts) != "string") {
							logger.error(`Invalid job entry, contacts are invalid!`);
							process.exit(1);
						} else if (typeof(jobContext.contacts) == "object" && jobContext.contacts.some(x => !phonebook.find(y => y.id === x))) {
							logger.error(`Invalid job entry, contact(object) is not in phonebook!`);
							process.exit(1);
						} else if (typeof(jobContext.contacts) == "string" && jobContext.contacts != "all") {
							logger.error(`Invalid job entry, contact(string) is not in phonebook!`);
							process.exit(1);
						}
						
						const messageContext = messages[jobContext.message];
						const targetContext = jobContext.contacts == "all" ? phonebook : phonebook.filter(x => jobContext.contacts.includes(x.id));
						const dateContext = jobContext.date;
					
						jobs.push({ message: messageContext, contacts: targetContext, date: dateContext });
					}
				})
				.catch((err) => {
					logger.error(err);
					process.exit(1);
				}).then(() => {
					// Create connection
					const conn = new WAConnection();

					// Setup callbacks

					// when a new QR is generated, ready for scanning
					conn.on("qr", (qr) => {
						logger.info(`QR code generated: ${qr}`);
					});
					// when the connection has opened successfully
					conn.on("open", () => {
						logger.info(`Connection opened.`);

						// Save credentials whenever updated
						const authInfo = conn.base64EncodedAuthInfo();
						fs.writeFileSync(`${root}${path.sep}auth_info.json`, JSON.stringify(authInfo, null, "\t"));
						logger.info(`Credentials updated!`);
					});
					// when the connection is opening
					conn.on("connecting", () => {
						logger.info(`Connection opening...`);
					});
					// when the connection has closed
					conn.on("close", (err) => {
						logger.info(`Connection closed. Reason: ${err.reason}`);
					});
					// when the socket is closed
					conn.on("ws-close", (err) => {
						logger.info(`Socket closed. Reason: ${err.reason}`);
					});
					// when the connection to the phone changes
					conn.on("connection-phone-change", (state) => {
						logger.info(`Connection to phone changed. ${state}`);
					});
					// when contacts are sent
					conn.on("contacts-received", (u) => {
						logger.info(`Contacts received. ${u.updatedContacts.length}`);
					});
					// when all initial messages are received from WA
					conn.on("initial-data-received", () => {
						logger.info(`Initial data received. Jobs will schedule...`);

						// Schedule jobs
						const jobsLength = Object.keys(jobs).length;
						logger.info(`${jobsLength} jobs was found!`);

						for (let i = 0; i < jobsLength; i++) {
							const job = jobs[i];
							const message = job.message;
							let jobHours = Number(job.date[0]);
							jobHours = jobHours < 10 ? "0" + jobHours : jobHours;
							let jobMinutes = Number(job.date[1]);
							jobMinutes = jobMinutes < 10 ? "0" + jobMinutes : jobMinutes;
	
							const now = moment();
							const jobDate = moment(`${now.format("YYYY-MM-DD")} ${jobHours}:${jobMinutes}:00`);
	
							if (jobDate.isBefore(now)) {
								jobDate.add(1, 'day');
							}

							const jobDateString = jobDate.format("DD-MM-YYYY HH:mm:ss SSSZ");
							
							customTimer(jobDate.valueOf(), { contacts: job.contacts, message: message })
								.then((ctx) => {
									const contacts = ctx.contacts;
									const message = ctx.message;
									logger.info(`Sending message "${message}" to ${contacts.length} contacts.`);
							
									for (let i = 0; i < contacts.length; i++) {
										const contact = contacts[i];
										const contactPhone = contact.phone;
										const contactName = contact.id;
											
										logger.info(`Sending message "${message}" to ${contactName} (${contactPhone}).`);
											
										conn.sendMessage(`${contactPhone}@s.whatsapp.net`, message, MessageType.text)
											.then((sentMsg) => {
												logger.info(`Message "${message}" sent to ${contactName} (${contactPhone}). Status: ${sentMsg.status}`);
											})
											.catch((err) => {
												logger.error(`Message "${message}" not sent to ${contactName} (${contactPhone}).`);
												logger.error(err);
											});							
									}

									logger.info(`Remaining timer count: ${global.__timerCount}`)

									if (global.__timerCount === 0) {
										logger.info(`All jobs finished!`);
										process.exit(0);
									}
								})
							logger.info(`Job('${message}') scheduled for date: ${jobDateString}.`);		
						}
					});

					// Load QR code from cache file
					const authInfoFile = `${root}${path.sep}auth_info.json`;
					if (fs.existsSync(authInfoFile) && fs.statSync(authInfoFile).size > 0) { 
						const rawAuthData = fs.readFileSync(authInfoFile);
						try {
							JSON.parse(rawAuthData);
						} catch(e) {
							logger.error(`Error parsing auth info file: ${e}`);
							process.exit(1);
						}

						conn.loadAuthInfo(authInfoFile);
					} 

					// Connect to WhatsApp
					conn.connect()
						.then(() => {
							logger.info(`Succesfully connected to WhatsApp!`);
						})
						.catch((err) => {
							logger.error(`Failed to connect to WhatsApp! Error: ${err}`);
							process.exit(1);
						});
				}
			);
		});
	});
}

// Entry
try {
	appMainRoutine();
} catch (e) {
	console.error(`Exception: ${e}`);
	process.exit(1);
}
