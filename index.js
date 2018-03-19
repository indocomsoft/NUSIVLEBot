// 3rd party libraries
const { MongoClient } = require('mongodb');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const htmlstrip = require('htmlstrip-native');

dotenv.load();

// Constants
const {
  TOKEN, API_KEY, URL_CALLBACK, INTERVAL, SEND_RESTART_MSG, SEND_NOTICE,
} = process.env;
const MONGODB_SERVER = 'mongodb://localhost:27017';
const DB_NAME = 'NUSIVLEBot';
const bot = new TelegramBot(TOKEN, { polling: true });
let db;
let chatId;

// My own libraries
const API = require('./lib/api');

function createApi(id, token) {
  const api = new API(API_KEY);
  return api.validateToken(token).then((response) => {
    chatId.updateOne({ id }, { $set: { ivle_token: response.Token } });
    return new Promise(resolve => resolve(api));
  });
}

function fetchAnnouncements(msg, modules, api, force = false, firstTime = false) {
  return chatId.findOne({ id: msg.chat.id }).then((r) => {
    let storedA = r.announcements;
    if (!(storedA instanceof Array)) {
      storedA = [];
    }
    const announcements = [];
    let tmp = new Promise((resolve) => { resolve(); });
    for (let i = 0; i < modules.length; i += 1) {
      tmp = tmp.then((rr) => {
        if (i > 0) {
          announcements[i - 1] = rr.Results;
        }
        return api.do('Announcements', { Duration: 0, CourseId: modules[i].ID });
      }).catch(() => {});
    }
    return tmp.then((rr) => {
      announcements[modules.length - 1] = rr.Results;
      announcements.forEach((a, i) => {
        // Remove duplicate announcements
        const uniqueA = a.filter((item, pos, self) => self.indexOf(item) === pos);
        let reply = '';
        uniqueA.forEach((aa) => {
          if (!(storedA[i] instanceof Array)) {
            storedA[i] = [];
          }
          if (storedA[i].filter(aaa => aaa.ID === aa.ID).length === 0) {
            reply = `- ${aa.Title}\n${htmlstrip.html_strip(aa.Description)}`;
            if (!firstTime) {
              bot.sendMessage(
                msg.chat.id,
                `${modules[i].CourseCode}: ${modules[i].CourseName}\n\n${reply}`,
              );
            }
            storedA[i].push({ ID: aa.ID });
          }
        });
        if (force && reply === '') {
          bot.sendMessage(
            msg.chat.id,
            `${modules[i].CourseCode}: ${modules[i].CourseName}\n\nNo new announcement`,
          );
        }
        chatId.updateOne({ id: msg.chat.id }, { $set: { announcements: storedA } });
      });
    }).catch((e) => { console.log(e); });
  }).catch((e) => { console.log(e); });
}

function recur(msg, modules, api) {
  return () => {
    chatId.findOne({ id: msg.chat.id }).then((rr) => {
      if (rr.push) {
        fetchAnnouncements(msg, modules, api);
        setTimeout(recur(msg, modules, api), parseInt(INTERVAL, 10) * 1000);
      }
    }).catch(() => {});
  };
}

function start(msg) {
  bot.sendMessage(
    msg.chat.id, `Hi ${msg.chat.first_name}! Let's get you set up!`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Get IVLE Token', url: `https://ivle.nus.edu.sg/api/login/?apikey=${API_KEY}&url=${URL_CALLBACK}` }],
        ],
      },
    },
  );
  chatId.insert({ id: msg.chat.id, ivle_token: 'ask', chat: msg.chat });
  return new Promise((resolve, reject) => reject());
}


MongoClient.connect(MONGODB_SERVER).then((client) => {
  console.log('Connected successfully to server');
  db = client.db(DB_NAME);
  chatId = db.collection('chatId');
  chatId.createIndex({ id: 1 }, { unique: true });
  chatId.find({}).toArray().then((r) => {
    r.forEach((msg) => {
      if (msg.push === true) {
        console.log(`Restoring state for ${msg.id}`);
        createApi(msg.id, msg.ivle_token).then((api) => {
          setTimeout(
            recur({ chat: { id: msg.id } }, msg.modules, api),
            parseInt(INTERVAL, 10) * 1000,
          );
          console.log(`State restored for ${msg.id}`);
        }).catch(() => {
          bot.sendMessage(msg.chat.id, 'Token has expired.');
          console.log(`Token expired for ${msg.id}`)
          return start(msg);
        });
      }
      if (parseInt(SEND_RESTART_MSG, 10) === 1) {
        bot.sendMessage(
          msg.id, 'Server has been restarted.\n\nWe restored ' +
          `your setting of push notification to *${msg.push === true ? 'on' : 'off'}*.\n\n` +
          'In case that didn\'t work, try doing `/push off` or `/push on` manually.',
          { parse_mode: 'Markdown' },
        );
      }
      if (parseInt(SEND_NOTICE, 10) === 1) {
        bot.sendMessage(msg.id, 'IVLE API is back up, bot should be working again.');
      }
    });
  }).catch(() => {});
}).catch((err) => {
  console.log(err);
  console.log('Unable to connect to server');
  process.exit(1);
}).then(() => {
  bot.on('message', (msg) => {
    const command = msg.text.split(' ')[0];
    const args = msg.text.substr(command.length + 1);
    let ready;
    let modules;
    if (command !== '/delete') {
      ready = chatId.findOne({ id: msg.chat.id }).then((r) => {
        if (command === '/token') {
          return createApi(msg.chat.id, args).catch(() => {
            bot.sendMessage(msg.chat.id, 'Invalid token. Please try again.');
            return start(msg);
          }).then(() => {
            bot.sendMessage(msg.chat.id, 'Token saved! Please run /setup to update your modules.');
            return new Promise((resolve, reject) => reject(new Error('setup')));
          });
        } else if (r.ivle_token === 'ask') {
          return start(msg);
        }
        ({ modules } = r);
        return createApi(msg.chat.id, r.ivle_token).catch(() => {
          bot.sendMessage(msg.chat.id, 'Token has expired.');
          return start(msg);
        });
      }).catch((err) => {
        if (err.message === 'setup') {
          return new Promise((resolve, reject) => reject(new Error('setup')));
        }
        return start(msg);
      });
    } else {
      return chatId.deleteOne({ id: msg.chat.id }).then(() => {
        bot.sendMessage(msg.chat.id, 'Your profile has been deleted.');
      }).catch(() => {
        bot.sendMessage(msg.chat.id, 'Failed to delete your profile. Please try again.');
      });
    }
    return ready.then((api) => {
      chatId.updateOne({ id: msg.chat.id }, { $set: { chat: msg.chat } });
      switch (command) {
        case '/delete':
          break;
        case '/mods': {
          let reply = '';
          try {
            modules.forEach((mod) => { reply = `${reply}\n- ${mod.CourseCode}: ${mod.CourseName}`; });
          } catch (e) {
            return bot.sendMessage(msg.chat.id, 'Please run /setup first');
          }
          bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
          break;
        }
        case '/setup':
          api.do('Modules').then((response) => {
            const result = response.Results.filter(mod => mod.isActive === 'Y')
              .map(mod => ({ ID: mod.ID, CourseCode: mod.CourseCode, CourseName: mod.CourseName }));
            return chatId.update({ id: msg.chat.id }, { $set: { modules: result } });
          }).then(() => {
            bot.sendMessage(msg.chat.id, 'Modules set up. Please run /push <on|off>');
          }).catch(() => {
            bot.sendMessage(msg.chat.id, 'Failed to setup, please run /setup again');
          });
          break;
        case '/announcements':
          fetchAnnouncements(msg, modules, api, true);
          break;
        case '/push': {
          const status = args.split(' ')[0];
          if (status === 'on') {
            chatId.findOne({ id: msg.chat.id }).then(async (r) => {
              if (!r.push) {
                chatId.updateOne({ id: msg.chat.id }, { $set: { push: true } });
                await fetchAnnouncements(msg, modules, api, false, true);
                setTimeout(recur(msg, modules, api), parseInt(INTERVAL, 10) * 1000);
                bot.sendMessage(msg.chat.id, `Set up announcements check every ${INTERVAL} seconds`);
              } else {
                bot.sendMessage(msg.chat.id, 'Push notification is already on');
              }
            });
          } else {
            chatId.updateOne({ id: msg.chat.id }, { $set: { push: false } });
            bot.sendMessage(msg.chat.id, 'Turned off push notification');
          }
          break;
        }
        case '/help':
          bot.sendMessage(msg.chat.id, 'Run /push <on|off>');
          break;
        case '/token':
          break;
        case '/start':
          break;
        default:
          break;
      }
      return false;
    });
  });
});
