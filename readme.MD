# Incident management demo

This repo is part of the Platform development workshop, it would be highly inadvisable to use it in production as is.

## Installing the app

1. In your Slack workspace, create a channel for listing declared incidents. 
2. Duplicate `.env.sample` to `.env`
3. Add the ID of the channel you created above to your .env file, after `INCIDENT_CHANNEL_ID` (hint, you can get the id by opening that channel in a browser, it's the part of the URL that begins with `C`, eg `CABC123DE`)
4. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
5. Go to OAuth and permissions and add the following Bot Token scopes: `commands`, `chat:write`,`channels:join`,`channels:manage`,`chat:write.public`,`app_mentions:read` and `reactions:write`
6. Go to Basic Information and click the **Show** button in the Signing Secret field, then copy that string. In the .env file, paste after `SLACK_SIGNING_SECRET`
7. Do the same for Client ID and Client secret, after `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` respectively.
8. Back in the app configuration, go to **Interactivity & Shortcuts**, turn Interactivity to `On` and set the Request URL to `https://YOUR-DOMAIN.TLD/slack/events`
9. On the same Interactive Components page, click the **Create New Shortcut** button and choose "Global"
10. Set the fields to:
	* Name: `Declare incident`
	* Short Description: `Start the incident management process`
	* Callback ID: `declare_incident`
11. On the Slash Commands page, click the **Create New Command** button 
12. Set the fields to:
	* Command: `/incident-bot`
	* Request URL: `Declare incident`
	* Short Description: `Start the incident management process`
	* Usage Hint: `[ic|sev|close]`
  	* Check the "Escape channels, users, and links sent to your app" box
13. Deploy your code
14. Once your server is live, go back to the app configuration, choose **Event Subscriptions**, turn Enable Events to `On` and set the Request URL to `https://YOUR-DOMAIN.TLD/slack/events`
15. On the same Event Subscriptions page, click the **Subscribe to bot events** header and choose "Add Bot User Event"
16. Choose the `app_home_opened` and `app_mention` events, then click the green "Save Changes" button

## Database

This app requires a MySQL database to function. This SQL should create the required tables.

```mysql
create schema incidentbot collate utf8mb4_0900_ai_ci;

create table incidents
(
	id int auto_increment
		primary key,
	name text not null,
	channel_id text null,
	commander text null,
	sev_level int default 0 not null,
	state varchar(255) default 'open' not null
);

create table installations
(
	team_id varchar(255) null,
	installation text null
);


```
