"use strict";

const csv = require("csv-parser");
const fs = require("fs");
const root = require('app-root-path');
const path = require('path');
const { MessageType, WAConnection } = require("@adiwajshing/baileys");
const Logger = require("./logger");

// Required for kill process
process.title = "wpautomsg";

// Handle process exit
process.on("exit", () => {
	console.log(`App specific shutdown detected. Stack:\n${console.trace()}`);
});
// Catch ctrl+c event
process.on("SIGINT", () => {
	console.log("Console break shutdown detected.");
	process.exit(2);
});
// Catch unhandled rejection
process.on("unhandledRejection", (err) => {
	console.log(err);
	process.exit(3);
});

// Application main routine
function appMainRoutine() {
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

	// Check if phonebook file exists
	const phonebookFile = `${root}${path.sep}phonebook.csv`;
	if (!fs.existsSync(phonebookFile)) {
		logger.error("Phonebook file not found.");
		process.exit(1);
	}

	// Read CSV phonebook file
	const phonebook = [];
	fs.createReadStream(phonebookFile)
		.pipe(csv())
		.on('data', (data) => {
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
		})
		.on("end", () => {
			logger.info(`Phonebook file read. ${phonebook.length} entries.`);

			if (!phonebook.length) {
				logger.error("Phonebook is empty.");
				process.exit(1);
			}
		})

	// Check if messages file exists
	const messagesFile = `${root}${path.sep}messages.csv`;
	if (!fs.existsSync(messagesFile)) {
		logger.error("Messages file not found.");
		process.exit(1);
	}

	// Read CSV messages file
	const messages = [];
	fs.createReadStream(messagesFile)
		.pipe(csv())
		.on('data', (data) => {
			messages.push(data.Message);
		})
		.on("end", () => {
			logger.info(`Messages file read. ${messages.length} entries.`);

			if (!messages.length) {
				logger.error("Messages are empty.");
				process.exit(1);
			}
		})

	// Create logger
	const log = new Logger();
	log.initialize();

	// Create connection
	const conn = new WAConnection();
	// conn.logger.level = 'debug';

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
		fs.writeFileSync(`${root}${path.sep}auth_info.json`, JSON.stringify(authInfo, null, '\t'));
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

		u.updatedContacts.forEach(o => {
			const phoneNumber = o.jid.split("@")[0];
			if (phoneNumber.toString().length !== 12) {
				logger.error(`Invalid phone number: ${phoneNumber}`);
				return;	
			} else if (!o.name) {
				logger.error(`Undefined contact name`);
				return;
			}

			phonebook.push({ type: "remote", id: o.name, phone: phoneNumber });
		});
	});
	// when all initial messages are received from WA
	conn.on("initial-data-received", () => {
		logger.info(`Initial data received.`);
	});
	// when all messages are received
	conn.on("chats-received", async ({ hasNewChats }) => {
		logger.info(`You have ${conn.chats.length} chats, new chats available: ${hasNewChats}`);

		const unread = await conn.loadAllUnreadMessages();
		logger.info(`You have ${unread.length} unread messages`);
	});
	// when a chat updated(new message, updated message, read message, deleted, pinned, presence updated etc)
	conn.on("chat-update", (chatUpdate) => {
		if (chatUpdate.messages && chatUpdate.count) {
			const message = chatUpdate.messages.all()[0];
			logger.info(message);
		} else {
			logger.info(chatUpdate);
		}
	});

	// Load qr code from cache file
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

// Entry
try {
	appMainRoutine();
} catch (e) {
	console.error(`Exception: ${e}`);
	process.exit(1);
}
