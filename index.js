// 3rd party libraries
const { MongoClient } = require('mongodb');
const assert = require('assert');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.load();

// Constants
const { TOKEN } = process.env;
const { API_KEY } = process.env;
const MONGODB_SERVER = 'mongodb://localhost:27017';
const DB_NAME = 'NUSIVLEBot';
const bot = new TelegramBot(TOKEN, { polling: true });
let db;
let chatId;

// My own libraries
const API = require('./lib/api');

const api = new API(API_KEY);


MongoClient.connect(MONGODB_SERVER, (err, client) => {
  assert.equal(null, err);
  console.log('Connected successfully to server');
  db = client.db(DB_NAME);
  chatId = db.collection('chatId');
  chatId.createIndex({ id: 1 }, { unique: true });
});

function start(msg) {
  return () => {
    bot.sendMessage(
      msg.chat.id, `Hi ${msg.chat.first_name}! Let's get you set up!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Get IVLE Token', url: 'https://ivle.nus.edu.sg/api/login/?apikey=K3dOV891qtKhjZFwdKQnd&url=https://indocomsoft.com/NUSIVLEBot/' }],
          ],
        },
      },
    );
    chatId.insert({ id: msg.chat.id, ivle_token: 'ask' });
  };
}

function fetchAnnouncements(msg, modules, force = false) {
  return chatId.findOne({ id: msg.chat.id }).then((r) => {
    let storedA = r.announcements;
    if (storedA === undefined) {
      storedA = [];
    }
    const announcements = [];
    let tmp = api.do('Announcements', { Duration: 0, CourseId: modules[0].ID });
    for (let i = 1; i < modules.length; i += 1) {
      tmp = tmp.then((rr) => {
        announcements[i - 1] = rr.Results;
        return api.do('Announcements', { Duration: 0, CourseId: modules[i].ID });
      });
    }
    return tmp.then((rr) => {
      announcements[modules.length - 1] = rr.Results;
      console.log(announcements);
      announcements.forEach((a, i) => {
        let reply = '';
        a.forEach((aa) => {
          if (storedA[i] === undefined) {
            storedA[i] = [];
          }
          if (storedA[i].filter(aaa => aaa.ID === aa.ID).length === 0) {
            reply += `- ${aa.Title}\n`;
            storedA[i].push({ ID: aa.ID });
          }
        });
        if (force) {
          if (reply === '') {
            reply += 'No new announcement';
            bot.sendMessage(
              msg.chat.id,
              `**${modules[i].CourseCode}: ${modules[i].CourseName}**\n\n${reply}`,
              { parse_mode: 'Markdown' },
            );
          }
        } else if (reply !== '') {
          bot.sendMessage(
            msg.chat.id,
            `**${modules[i].CourseCode}: ${modules[i].CourseName}**\n\n${reply}`,
            { parse_mode: 'Markdown' },
          );
        }
      });
      chatId.updateOne({ id: msg.chat.id }, { $set: { announcements: storedA } });
    });
  });
}

bot.on('message', (msg) => {
  console.log(msg);
  const command = msg.text.split(' ')[0];
  const args = msg.text.substr(command.length + 1);
  let ready;
  let modules;

  if (command !== '/delete') {
    ready = chatId.findOne({ id: msg.chat.id }).then((r) => {
      if (r.ivle_token === 'ask' && command === '/token') {
        return api.validateToken(args).then((response) => {
          chatId.updateOne({ id: msg.chat.id }, { $set: { ivle_token: response.Token } });
          bot.sendMessage(msg.chat.id, 'Token saved! Please run /setup to update your modules.');
        }).catch(() => {
          bot.sendMessage(msg.chat.id, 'Invalid token. Please try again.');
          start(msg)();
        });
      } else if (r.ivle_token === 'ask') {
        return start(msg)();
      }
      return api.validateToken(r.ivle_token).then((response) => {
        if (r.ivle_token !== response.Token) {
          chatId.updateOne({ id: msg.chat.id }, { $set: { ivle_token: response.Token } });
        }
        ({ modules } = r);
        console.log(r.modules);
        return response;
      }).catch(() => {
        bot.sendMessage(msg.chat.id, 'Token has expired.');
        return start(msg)();
      });
    }).catch(start(msg));
  }

  switch (command) {
    case '/delete':
      chatId.deleteOne({ id: msg.chat.id }).then(() => {
        bot.sendMessage(msg.chat.id, 'Your profile has been deleted.');
      }).catch(() => {
        bot.sendMessage(msg.chat.id, 'Failed to delete your profile. Please try again.');
      });
      break;
    case '/mods':
      ready.then(() => {
        let reply = '';
        try {
          modules.forEach((mod) => { reply = `${reply}\n- ${mod.CourseCode}: ${mod.CourseName}`; });
        } catch (e) {
          return bot.sendMessage(msg.chat.id, 'Please run /setup first');
        }
        return bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
      });
      break;
    case '/setup':
      ready.then(() => {
        api.do('Modules').then((response) => {
          const result = response.Results.filter(mod => mod.isActive === 'Y')
            .map(mod => ({ ID: mod.ID, CourseCode: mod.CourseCode, CourseName: mod.CourseName }));
          return chatId.update({ id: msg.chat.id }, { $set: { modules: result } });
        });
      }).then(() => {
        bot.sendMessage(msg.chat.id, 'Modules set up. Please run /push <on|off> <interval in seconds>');
      }).catch(() => {
        bot.sendMessage(msg.chat.id, 'Failed to setup, please run /setup again');
      });
      break;
    case '/announcements':
      ready.then(() => {
        fetchAnnouncements(msg, modules, true);
      });
      break;
    case '/push':
      ready.then(() => {
        const [status, interval] = args.split(' ');
        if (status === 'on') {
          chatId.findOne({ id: msg.chat.id }).then((r) => {
            if (!r.push) {
              chatId.updateOne({ id: msg.chat.id }, { $set: { push: true } });
              const recur = () => {
                chatId.findOne({ id: msg.chat.id }).then((rr) => {
                  if (rr.push) {
                    fetchAnnouncements(msg, modules);
                    setTimeout(recur, parseInt(interval, 10) * 1000);
                  }
                });
              };
              setTimeout(recur, parseInt(interval, 10) * 1000);
              bot.sendMessage(msg.chat.id, `Set up announcements check every ${interval} seconds`);
            }
          });
        } else {
          chatId.updateOne({ id: msg.chat.id }, { $set: { push: false } });
          bot.sendMessage(msg.chat.id, 'Turned off push notification');
        }
      });
      break;
    case '/help':
      bot.sendMessage(msg.chat.id, 'Run /push <on|off> <interval in seconds>');
      break;
    case '/token':
      break;
    case '/start':
      break;
    default:
      break;
  }
});
