require('dotenv').config();

const { App } = require('@slack/bolt');
const { createConnection } = require('mysql2/promise');

const databaseConfig = {
  host: process.env.DB_HOSTNAME,
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD
}

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.STATE_SECRET,
  scopes: process.env.SLACK_BOT_SCOPES,
  installationStore: {
    storeInstallation: async installation => {
      const connection = await createConnection(databaseConfig);
      connection.execute(
        'INSERT INTO installations SET team_id = ?, installation = ?',
        [
          installation.team.id,
          JSON.stringify(installation)
        ]
      ).then(async () => {
        await connection.end();
        return;
      }
      ).catch((error) => {
        console.error(error);
      });
    },
    fetchInstallation: async installQuery => {
      const connection = await createConnection(databaseConfig);

      const install = await connection.query(
        'SELECT installation FROM installations where team_id = ?',
        [
          installQuery.teamId,
        ]
      ).then(async ([rows]) => {
        if (rows.length > 0) {
          const results = rows;
          return results[0]["installation"];
        } else {
          console.log(`[OAuth] No matching installation for ${installQuery.teamId}`);
        }
      }
      ).catch((error) => {
        console.error(error);
      });
      return JSON.parse(install);
    }
  }
});

app.shortcut('declare_incident', async ({ ack, shortcut, client }) => {
  await ack();
  const newIncidentModalView = {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: 'IncidentBot',
      emoji: true,
    },
    submit: {
      type: 'plain_text',
      text: 'Declare incident',
      emoji: true,
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
      emoji: true,
    },
    callback_id: 'incident-declared',
    blocks: [
      {
        type: 'input',
        block_id: 'description',
        element: {
          type: 'plain_text_input',
          action_id: 'description'
        },
        label: {
          type: 'plain_text',
          text: 'Provide a brief description of the incident',
          emoji: true,
        },
      },
      {
        type: 'input',
        block_id: 'sev-level',
        element: {
          type: 'static_select',
          placeholder: {
            type: 'plain_text',
            text: 'Choose a severity level',
            emoji: true,
          },
          action_id: 'sev-level',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'SEV 1',
                emoji: true,
              },
              value: '1',
            },
            {
              text: {
                type: 'plain_text',
                text: 'SEV 2',
                emoji: true,
              },
              value: '2',
            },
            {
              text: {
                type: 'plain_text',
                text: 'SEV 3',
                emoji: true,
              },
              value: '3',
            },
          ],
        },
        label: {
          type: 'plain_text',
          text: 'Severity Level',
          emoji: true,
        },
      },
      {
        type: 'input',
        block_id: 'commander',
        element: {
          action_id: 'commander',
          type: 'users_select',
          placeholder: {
            type: 'plain_text',
            text: 'Choose an Incident Commander',
            emoji: true,
          },
        },
        label: {
          type: 'plain_text',
          text: 'Incident Commander',
          emoji: true,
        },
      },
    ],
  }
  try {
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: newIncidentModalView
    });
  }
  catch (error) {
    console.error(error);
  }
});

app.view('incident-declared', async ({ ack, view, client, body }) => {
  await ack();
  const incidentName = view.state.values['description']['description']['value']
  const incidentLevel = view.state.values['sev-level']['sev-level']['selected_option']['value'];
  const incidentCommander = view.state.values['commander']['commander']['selected_user'] || null;
  const declaringUser = body.user.id;

  console.log(body);

  const connection = await createConnection(databaseConfig);
  const [rows, fields] = await connection.execute(
    'INSERT INTO incidents SET name = ?',
    [
      incidentName
    ]
  );

  const incidentId = rows['insertId'];

  const todaysDate = new Date();
  const year = todaysDate.getFullYear();
  const month = ("0" + (todaysDate.getMonth() + 1)).slice(-2)
  const day = todaysDate.getDate();

  const incidentChannelData = await client.conversations.create({
    name: `incd-${year}${month}${day}-${incidentId}-${incidentName.substr(0, 40).replace(/\W+/g, '-').toLowerCase()}`
  });

  const channelId = incidentChannelData.channel.id;

  await connection.execute(
    'UPDATE incidents SET channel_id = ?, commander = ?, sev_level = ? WHERE id = ?',
    [
      channelId,
      incidentCommander,
      incidentLevel,
      incidentId
    ]
  );

  await client.conversations.setTopic({
    channel: channelId,
    topic: `SEV ${incidentLevel} | :female-firefighter: <@${incidentCommander}>`
  });

  await client.conversations.invite({
    channel: channelId,
    users: `${declaringUser}, ${incidentCommander}`
  });

  await client.chat.postMessage({
    channel: channelId,
    text: `Incident declared: <#${channelId}>`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: incidentName,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:rotating_light: SEV Level ${incidentLevel}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:female-firefighter: <@${incidentCommander}>`,
        },
      }
    ]
  });

  await client.chat.postMessage({
    channel: process.env.INCIDENT_CHANNEL_ID,
    text: `Incident declared: <#${channelId}>`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: incidentName,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:rotating_light: SEV Level ${incidentLevel}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:female-firefighter: <@${incidentCommander}>`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `For more information, join the incident channel - <#${channelId}>`,
        },
      },
    ]

  });

});

async function closeIncident(client, user, channel, message_ts = 0) {
    console.log('update state');
    const connection = await createConnection(databaseConfig);

    await connection.execute(
      'UPDATE incidents SET state = ? WHERE channel_id = ?',
      [
        'closed',
        channel,
      ]
    );

    const [rows, _] = await connection.query('SELECT * from incidents where channel_id = ?', [channel]);
    await connection.close();
    const incidentFromDB = rows[0];

    await client.conversations.setTopic({
      channel: channel,
      topic: `Incident Closed | SEV ${incidentFromDB['sev_level']} | :female-firefighter: <@${incidentFromDB['commander']}>`
    });

    if (message_ts > 0) {
      await client.reactions.add({
        channel: channel,
        timestamp: message_ts,
        name: 'white_check_mark'
      });
    }

 
}

async function updateSEV(client, level, user, channel, message_ts = 0) {
  if (level > 0 && level <= 3) {
    console.log('update SEV');
    const connection = await createConnection(databaseConfig);

    await connection.execute(
      'UPDATE incidents SET sev_level = ? WHERE channel_id = ?',
      [
        level,
        channel,
      ]
    );

    const [rows, _] = await connection.query('SELECT * from incidents where channel_id = ?', [channel]);
    await connection.close();
    const incidentFromDB = rows[0];

    await client.conversations.setTopic({
      channel: channel,
      topic: `SEV ${incidentFromDB['sev_level']} | :female-firefighter: <@${incidentFromDB['commander']}>`
    });

    if (message_ts > 0) {
      await client.reactions.add({
        channel: channel,
        timestamp: message_ts,
        name: 'white_check_mark'
      });
    }


  } else {
    if (message_ts > 0) {
      await client.reactions.add({
        channel: channel,
        timestamp: message_ts,
        name: 'warning'
      });
    }
    await client.chat.postEphemeral({
      channel: channel,
      user: user,
      text: "Set a SEV between 1 and 3 please"
    });

  }
}

async function updateIC(client, commander, user, channel, message_ts = 0) {
  if (commander.startsWith('<@') || commander.startsWith('W') || commander.startsWith('U')) {
    console.log(commander);
    commander = commander.indexOf('|') >= 0 ? commander.split('|', 1)[0].concat('>') : commander;
    console.log(commander);
    const connection = await createConnection(databaseConfig);

    await connection.execute(
      'UPDATE incidents SET commander = ? WHERE channel_id = ?',
      [
        commander.substring(2, commander.length - 1),
        channel,
      ]
    );

    const [rows, _] = await connection.query('SELECT * from incidents where channel_id = ?', [channel]);
    await connection.close();
    const incidentFromDB = rows[0];

    await client.conversations.setTopic({
      channel: channel,
      topic: `SEV ${incidentFromDB['sev_level']} | :female-firefighter: <@${incidentFromDB['commander']}>`
    });

    if (message_ts > 0) {
      await client.reactions.add({
        channel: channel,
        timestamp: message_ts,
        name: 'white_check_mark'
      });
    }
  } else {
    if (message_ts > 0) {

      await client.reactions.add({
        channel: channel,
        timestamp: message_ts,
        name: 'warning'
      });
    }
    await client.chat.postEphemeral({
      channel: channel,
      user: user,
      text: "Cannot parse user"
    });
  }
}

app.event('app_mention', async ({ event, client }) => {
  console.log(event);
  const text = event.text;

  const [_, command, value] = text.split(' ', 3);
  const commandNormalised = command.toLowerCase();

  switch (commandNormalised) {
    case 'sev':
      updateSEV(client, value, event.user, event.channel, event.event_ts);
      break;

    case 'ic':
      updateIC(client, value, event.user, event.channel, event.event_ts);
      break;

    case 'close':
      closeIncident(client, event.user, event.channel, event.event_ts);
      break;

    default:
      console.warn('unknown command');
      await client.reactions.add({
        channel: event.channel,
        timestamp: event.event_ts,
        name: 'warning'
      });
      await client.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        text: "I'm sorry Dave, I can't do that"
      });
      break;
  }
});

app.command('/incident-bot', async ({ ack, client, command }) => {
  await ack();
  console.log(command);

  const [instruction, value] = command.text.split(' ', 2);

  const instructionNormalised = instruction.toLowerCase();

  switch (instructionNormalised) {
    case 'sev':
      updateSEV(client, value, command.user_id, command.channel_id);
      break;

    case 'ic':
      updateIC(client, value, command.user_id, command.channel_id);
      break;

    case 'close':
      closeIncident(client, command.user_id, command.channel_id);
      break;

    default:
      console.warn('unknown command');
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: "I'm sorry Dave, I can't do that"
      });
      break;
  }

});

app.event('app_home_opened', async ({event, client}) => {

  const connection = await createConnection(databaseConfig);

  const [rows, _] = await connection.query('SELECT * from incidents where state = ?', ['open']);
  await connection.close();

  const openIncidentBlocks = [];



  rows.forEach(row => {
    console.log(row);
    openIncidentBlocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<#${row['channel_id']}>* | SEV ${row['sev_level']} | :female-firefighter: <@${row['commander']}>`,
        },
      },
    );
  });

  const homeBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Open Incidents',
        emoji: true,
      },
    },
    {
      type: 'divider',
    }
  ];

  const appHomeView = {
    type: 'home',
    blocks: homeBlocks.concat(openIncidentBlocks),
  };

  client.views.publish({
    view: appHomeView,
    user_id: event.user
  })
  
});

(async () => {
  // Start the app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt: App is running!');
})();