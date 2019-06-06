var express = require('express');
// var path = require('path');
var parser = require('body-parser');
var mongo = require('mongodb').MongoClient;
var OID = require('mongodb').ObjectID;

var app = express();
var server = require('http').createServer(app);

var crypto = require('crypto');

// Encrypt a string
function encrypt(str) {
  var cipher = crypto.createCipher('aes-256-ctr', 'N58Q2ae9');
  var encrypedStr = cipher.update(str, 'utf8', 'hex');
  encrypedStr += cipher.final('hex');
  return encrypedStr;
}

var port = 8080;
var db = 'meditation';
var url = 'mongodb://localhost:27017/' + db;

var userLogin = '';

app.set('port', port);

app.use(parser.json());
app.use(parser.urlencoded({ extended: true }));

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.post('/account', function(req, res) {
	// The user entry to be made
	var newUser = {
		firstname: req.body.accountFirstName,
		lastname: req.body.accountLastName,
		username: req.body.accountUsername,
		password: encrypt(req.body.accountPassword),
		email: req.body.accountEmail,
		zipcode: req.body.accountZip,
		defaultHrs: "0",
		defaultMinutes: "10",
		defaultSeconds: "00"
	}

	// Insert the account
	mongo.connect(url, function(err, db) {
		if (err) throw err;

		db.collection('users').findOne({
			username: req.body.accountUsername,
		}, function(err, item) {
			if (err) throw err;

			if (item !== null) {
				res.setHeader('Content-Type', 'application/json');
				res.end(
					JSON.stringify({
						accountCreated: false,
						accountMsg: "Username is already taken",
					})
				);

				db.close();
			} else {
				db.collection('users').insert(newUser, function(err, docs) {
					if (err) throw err;

					res.setHeader('Content-Type', 'application/json');
					res.end(
						JSON.stringify({
							accountCreated: true,
							accountMsg: '',
						})
					);

					db.close();
				});
			}
		});
	});
})

// Check that the login credentials are correct, 
// that the username exists and that the password is correct
app.post('/login', function(req, res) {
	mongo.connect(url, function(err, db) {		
		if (err) throw err;
		
		// Look for username
		db.collection('users').findOne({
			username: req.body.loginUsername,
		}, function(err, item) {
			if (err) throw err;
			var loginAccepted = false;
			var loginMsg = "";
			
			// If the username is not found or the login password doesn't match the user's password
			if (!item || encrypt(req.body.loginPassword) !== item.password) {
				loginMsg = "Invalid Credentials";
			} else {
				// Indicate if the credentials are correct

				loginAccepted = true;
				loginMsg = "The entry is correct!";
				
				userLogin = req.body.loginUsername;
			}

			res.setHeader('Content-Type', 'application/json');
			res.end(
				JSON.stringify({
					loginAccepted: loginAccepted,
					loginMsg: loginMsg,
					loginSession: userLogin,
				})
			);
			
			db.close();
		});
	});
});

// Go to the home page, or redirect to the login if a user isn't logged in
app.post('/checkUserSession', function(req, res) {
	let canMeditate = false;
	if (userLogin && req.body.userSession === userLogin)
		canMeditate = true;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify({ canMeditate, userSession: userLogin }));
});

// Log out of the site
app.post('/killUserSession', function(req, res) {
	userLogin = '';

	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify({
		canMeditate: false,
	}));
});

app.post('/meditationEntry', function(req, res) {
	var meditationEntry = {
		username: req.session.user,
		meditateDateTime: req.body.meditateDateTime,
		meditateDuration: req.body.meditateDuration,
		journalEntry: req.body.journalEntry
	}

	// Insert the meditation entry to the database
	mongo.connect(url, function(err, db) {
		if (err) throw err;
		
		db.collection('meditationrecord').insert(meditationEntry, function(err, docs) {
			if (err) throw err;
						
			res.setHeader('Content-Type', 'application/json');
			res.end(
				JSON.stringify({
					meditationEntryMsg: 'Meditation Entry Made!',
				})
			);
	
			db.close();
		});
	});
});

// Get the records for a user for a month/year
function getDates(user, month, year, callback) {
	// Put the month and year in the proper format
	var monthYear = String(year) + "-";
	if (Number(month) < 9) monthYear += "0";
	monthYear += String(Number(month)+1);

	// Find the records for that month/year
	mongo.connect(url, function(err, db) {
		if (err) throw err;
		
		db.collection('meditationrecord').find({
			username: {
				$eq: user
			},
			date: new RegExp(monthYear)
		}).toArray(function(err, docs) {
			if (err) throw err;
			
			// Get the calendar
			var dates = printCalendar(month, year, docs);
			callback(dates);
			db.close();
		});
	});
}

// Construct the calendar to be displayed for a particular month/year,
// showing the meditation time, a link to modify the journal entry,
// and a button to delete the entry
function printCalendar(month, year, dates) {
	var cal = "<table id='progressCalendar'><thead><tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr><tbody>";

	// Get the number of days in the month
	var numDays = 0;
	switch (Number(month)) {
		case 0:
		case 2:
		case 4:
		case 6:
		case 7:
		case 9:
		case 11:
			numDays = 31;
			break;
		case 3:
		case 5:
		case 8:
		case 10:
			numDays = 30;
			break;
		case 1:
			numDays = 28;
			if (((Number(year) % 4 === 0) && (Number(year) % 100 !== 0)) || (Number(year) % 400 === 0)) numDays++;
	}
	
	var firstDay = new Date(year, month);
	var start = 0 - firstDay.getDay();
	var end = numDays;// + (7 - Math.abs(start));
	while ((end + Math.abs(start)) % 7 !== 0) end++;
	
	// For each day of the month, if there's an entry, put it in
	var count = 0;
	for (var d = start+1; d <= end; d++) {
		if (count === 0) cal += "<tr>";
		cal += "<td>";

		// Put the day of the month in 
		if (d > 0 && d <= numDays)
			cal += "<div id='monthDay'>" + String(d) + "</div><br><div id='dayRecord'>";

		// Put the meditation entries in
		for (logs in dates) {
			var loggedDay = String(dates[logs].date).split("-")[2];
			if (Number(loggedDay) === d) {
				// Modify the time from military time
				var hrmin = String(dates[logs].datetime).split(":");
				if (Number(hrmin[0]) > 12) hrmin = String(Number(hrmin[0]) - 12) + ":" + String(hrmin[1]) + " PM";
				else if (Number(hrmin[0]) === 0) hrmin = "12" + ":" + String(hrmin[1]) + " AM";
				else hrmin = String(dates[logs].datetime) + " AM";
					
				
				cal += "<div id='logResult'>" + String(dates[logs].medtime);
				cal += "&nbsp<form method='POST' action='journal' class='journalMods'>";
				cal += "<input type='hidden' value='" + dates[logs]._id + "' name='jid'>";
				cal += "<button type='submit' id='editJournal'><i class='fa fa-book' aria-hidden='true'></i></button></form>";
				cal += "&nbsp<form method='POST' action='deleteJournalEntry' class='journalMods' onsubmit='return confirm(\"Confirm that you wish to delete this meditation entry\")'>";
				cal += "<input type='hidden' value='" + dates[logs]._id + "' name='jdid'>";
				cal += "<button type='submit' id='deleteJournal'><i class='fa fa-times-circle' aria-hidden='true'></i></button>";
				cal += hrmin + "</form></div>";
			}
		}

		cal += "</div></td>";

		count++;
		if (count > 6) {
			count = 0;
			cal += "</tr>";
		}
	}
	
	cal += "</tbody></table>";

	// Return the constructed calendar
	return cal;
}

// Get the progress page, or redirecting to the login page
// if a user isn't logged in
// app.get('/progress', function(req, res) {
// 	if (req.session.user) {
// 		var d = new Date();
// 		var month = Number(d.getMonth());
// 		var year = Number(d.getFullYear());
		
// 		getDates(req.session.user, month, year, function(dates) {
// 			if (dates) res.render('progress', { progCal: "" });
// 			else return;
// 		});
// 	}
// 	else {
// 		res.render('login', { lerr: false, accountCreated: false });
// 	}
// });

// Display the calendar of progress for a month/year
// app.post('/progress', function(req, res) {	
// 	res.render('progress');
// });

// If a journal is to be modified, put in the id and entry
// app.post('/journal', function(req, res) {
// 	var jid = new OID(req.body.jid);
	
// 	mongo.connect(url, function(err, db) {
// 		if (err) throw err;
		
// 		db.collection('meditationrecord').findOne({ _id: jid}, function(err, jmentry) {
// 			if (err) throw err;
			
// 			res.render('journal', {
// 				jid: req.body.jid,
// 				jentry: jmentry.entry,
// 				jdate: jmentry.date
// 			});	
			
// 			db.close();
// 		});
// 	});
// });

// Modify the journal entry in the collection, using the id to find it
// app.post('/journalModification', function(req, res) {	
// 	// If the submit button was clicked, modify the entry
// 	if (req.body.modifyEntry === "Submit") {
// 		var jeid = new OID(req.body.mjid);
	
// 		// Update the record
// 		mongo.connect(url, function(err, db) {
// 			if (err) throw err;
			
// 			db.collection('meditationrecord').update(
// 				{ _id: jeid },
// 				{ $set:
// 					{ entry: req.body.mjentry }
// 				},
// 				function() {
// 					db.close();
// 				}
// 			);
// 		});
	
// 		res.render('progress', { progCal: "Meditation Entry Modified!" });
// 	}
// 	// Or else return to the progress page without modifying the entry
// 	else {
// 		res.render('progress', { progCal: "" });	
// 	}
// });

// Delete a journal entry
// app.post('/deleteJournalEntry', function(req, res) {
// 	var jdid = new OID(req.body.jdid);
	
// 	// Delete the record
// 	mongo.connect(url, function(err, db) {
// 		if (err) throw err;
		
// 		db.collection('meditationrecord').remove({
// 			_id: jdid
// 		}, function() {
// 			db.close();
// 		});
// 	});
	
// 	res.render('progress', { progCal: "Meditation Entry Deleted!" });
// });

/* Timer code */

// Get the timer page, redirect to login if no user is logged in
// app.get('/timer', function(req, res) {
// 	if (req.session.user) {
// 		mongo.connect(url, function(err, db) {
// 			if (err) throw err;
			
// 			db.collection('users').findOne({
// 				username: req.session.user
// 			}, function(err, time) {
// 				if (err) throw err;
				
// 				if (time === null) {
// 					res.render('timer', {
// 						defaultHrs: "0",
// 						defaultMinutes: "10",
// 						defaultSeconds: "00"
// 					});
// 				}
// 				else {
// 					res.render('timer', {
// 						defaultHrs: time.defaultHrs,
// 						defaultMinutes: time.defaultMinutes,
// 						defaultSeconds: time.defaultSeconds
// 					});
// 				}		
// 				db.close();
// 			});
// 		});
// 	}
// 	else {
// 		res.render('login', { lerr: false, accountCreated: false});
// 	}
// });

// Show the meditation timer
// app.post('/timer', function(req, res) {
// 	// The meditation log for a user
// 	var mlog = {
// 		username: req.session.user,
// 		date: req.body.meditationDate,
// 		medtime: req.body.meditationTime,
// 		datetime: req.body.meditationHrMin,
// 		entry: req.body.journalEntry
// 	}
		
// 	// Insert the meditation log to the database
// 	mongo.connect(url, function(err, db) {
// 		if (err) throw err;
		
// 		db.collection('meditationrecord').insert(mlog, function(err, docs) {
// 			if (err) throw err;
// 			else console.log("Entry made\n");
						
// 			// Move to the progress page
// 			res.render('progress', { progCal: "Meditation Entry Made!" });
	
// 			db.close();
// 		});
// 	});
// });

/* Set up the account */

// Sockets for checking the username for the account creation
// as well as the username/password for the login
// io.on('connection', function(sock) {
// 	console.log('Client connected...');
	
// 	sock.on('requestMonthProgress', function(date) {	
// 		getDates(sessionUser, Number(date.progressMonth), Number(date.progressYear), function(dates) {
// 			sock.emit('receiveMonthProgress', { progDates: dates });
// 		});
// 	});
	
// 	// Set the default time for a user
// 	sock.on('setDefaultTime', function(time) {
// 		mongo.connect(url, function(err, db) {
// 			if (err) throw err;
			
// 			db.collection('users').update(
// 				{ username: sessionUser },
// 				{ $set:
// 					{
// 						defaultHrs: time.defaultHrs,
// 						defaultMinutes: time.defaultMinutes,
// 						defaultSeconds: time.defaultSeconds,
// 					}
// 				}, function() {
// 					console.log("Default time modified...");
// 					db.close();
// 					sock.emit('defaultTimeSet', {});
// 				}
// 			);
// 		});
// 	});
	
// 	// Check to see if the username is available, sending a
// 	// signal back to the client if it is or isn't
// 	sock.on('unameCheck', function(uname) {		
// 		mongo.connect(url, function(err, db) {
// 			if (err) throw err;
			
// 			db.collection('users').findOne({
// 				username: uname.username
// 			}, function(err, item) {
// 				if (err) throw err;
				
// 				if (item === null) {
// 					console.log("Username available\n");
// 					sock.emit('unameCheckResponse', { unameFree: true });
// 				} else {
// 					console.log("Username not available\n");
// 					sock.emit('unameCheckResponse', { unameFree: false });
// 				}		
// 				db.close();
// 			});
// 		});
// 	});
	
// 	// Check that the login credentials are correct, 
// 	// that the username exists and that the password is correct
// 	sock.on('loginCheck', function(login) {
// 		mongo.connect(url, function(err, db) {		
// 			if (err) throw err;
			
// 			// Look for username
// 			db.collection('users').findOne({
// 				username: login.loginUname,
// 			}, function(err, item) {
// 				if (err) throw err;
				
// 				// If the username is not found or the login password doesn't match the user's password
// 				if (!item) {
// 					console.log("The username is not valid\n");
// 					sock.emit('loginCheckResponse', { loginAccepted: false });
// 				} 
// 				else {
// 					if (encrypt(login.loginPword) !== item.password) {
// 						console.log("The password is not correct\n");
// 						sock.emit('loginCheckResponse', { loginAccepted: false });
// 					} 
// 					// Indicate if the credentials are correct
// 					else {
// 						console.log("The entry is correct!\n");
// 						sock.emit('loginCheckResponse', { loginAccepted: true });
// 					}
// 				}
// 				db.close();
// 			});
// 		});
// 	});
	
// 	// Modify the account information
// 	sock.on('accountModification', function(mod) {		
// 		// Modify the account if the user clicked Modify and not Cancel
// 		if (mod.username !== "" && mod.accountMod !== "Cancel") {
// 			mongo.connect(url, function(err, db) {
// 				if (err) throw err;
			
// 				db.collection('users').update(
// 					{ username: mod.username },
// 					{ $set:
// 						{
// 							firstname: mod.firstname,
// 							lastname: mod.lastname,
// 							email: mod.email,
// 							zipcode: mod.zipcode
// 						}
// 					}, function() {
// 						sock.emit('accountModified', {
// 							modified: true
// 						});
// 						db.close();
// 						sock.disconnect();
// 					}
// 				);
// 			});
// 		}
		
// 		// Otherwise grab the original information and fill the fields back in
// 		else if (mod.username !== "" && mod.accountMod === "Cancel") {
// 			mongo.connect(url, function(err, db) {
// 				if (err) throw err;
	
// 				db.collection('users').findOne({
// 					username: mod.username
// 				}, function(err, user) {
// 					if (err) throw err;
		
// 					sock.emit('accountModified', {
// 						username: mod.username,
// 						firstname: user.firstname,
// 						lastname: user.lastname,
// 						email: user.email,
// 						zipcode: user.zipcode
// 					});
		
// 					db.close();
// 				});
// 			});
// 		}
// 	});
	
// 	// Modify the password
// 	sock.on('pwordChange', function(cpword) {
// 		mongo.connect(url, function(err, db) {
// 			if (err) throw err;
			
// 			db.collection('users').findOne({
// 				username: cpword.username
// 			}, function(err, item) {
// 				if (err) throw err;
				
// 				if (item.password !== encrypt(cpword.oldpword)) {
// 					sock.emit('newpwordAccepted', { pwordAccept: false });
// 					db.close();
// 				}
// 				else {
// 					db.collection('users').update(
// 						{ username: cpword.username },
// 						{ $set:
// 							{
// 								password: encrypt(cpword.newpword)
// 							}
// 						}, function() {
// 							console.log("User password changed!");
// 							sock.emit('newpwordAccepted', { pwordAccept: true });
// 							db.close();
// 						}
// 					);
// 				}
// 			});
// 		});
// 	});
// });

// // Render the account creation page
// app.get('/account', function(req, res) {
// 	res.render('account');
// });

// // Add an account to the users collection
// app.post('/account', function(req, res) {
// 	console.log("User added\n");

// 	// The user entry to be made
// 	var user = {
// 		firstname: req.body.firstname,
// 		lastname: req.body.lastname,
// 		username: req.body.username,
// 		password: encrypt(req.body.password),
// 		email: req.body.email,
// 		zipcode: req.body.zipcode,
// 		defaultHrs: "0",
// 		defaultMinutes: "10",
// 		defaultSeconds: "00"
// 	}

// 	// Insert the account
// 	mongo.connect(url, function(err, db) {
// 		if (err) throw err;
		
// 		db.collection('users').insert(user, function(err, docs) {
// 			db.close();
// 		});
// 	});
	
// 	// Move to the login page
// 	res.render('login', { lerr: false, accountCreated: true });
// })

// /* Log in */

// // Move to the login page
// app.get('/', function(req, res) {
// 	res.render('login', { lerr: false, accountCreated: false });
// });

// // Show the account modification page, grab the current
// // account info for the user
// app.get('/accountmod', function(req, res) {
// 	mongo.connect(url, function(err, db) {
// 		if (err) throw err;
		
// 		db.collection('users').findOne({
// 			username: req.session.user
// 		}, function(err, user) {
// 			if (err) throw err;
			
// 			res.render('accountmod', {
// 				username: user.username,
// 				firstname: user.firstname,
// 				lastname: user.lastname,
// 				email: user.email,
// 				zipcode: user.zipcode
// 			});
			
// 			db.close();
// 		});
// 	});
// });

// // The logged in user will move to the home page
// app.post('/home', function(req, res) {
// 	req.session.user = req.body.loginUname;
// 	sessionUser = req.session.user;
// 	res.redirect('/home');
// });

// // Listen for an incoming connection
server.listen(8080, function() {
	console.log("Server is listening...\n");
});
