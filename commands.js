/**
 * System commands
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * These are system commands - commands required for Pokemon Showdown
 * to run. A lot of these are sent by the client.
 *
 * If you'd like to modify commands, please go to config/commands.js,
 * which also teaches you how to use commands.
 *
 * @license MIT license
 */

var crypto = require('crypto');
var fs = require('fs');

const MAX_REASON_LENGTH = 300;

var commands = exports.commands = {

	version: function (target, room, user) {
		if (!this.canBroadcast()) return;
		this.sendReplyBox("Server version: <b>" + CommandParser.package.version + "</b>");
	},

	me: function (target, room, user, connection) {
		// By default, /me allows a blank message
		if (target) target = this.canTalk(target);
		if (!target) return;

		return '/me ' + target;
	},

	mee: function (target, room, user, connection) {
		// By default, /mee allows a blank message
		if (target) target = this.canTalk(target);
		if (!target) return;

		return '/mee ' + target;
	},

	avatar: function (target, room, user) {
		if (!target) return this.parse('/avatars');
		var parts = target.split(',');
		var avatar = parseInt(parts[0]);
		if (!avatar || avatar > 294 || avatar < 1) {
			if (!parts[1]) {
				this.sendReply("Invalid avatar.");
			}
			return false;
		}

		user.avatar = avatar;
		if (!parts[1]) {
			this.sendReply("Avatar changed to:\n" +
				'|raw|<img src="//play.pokemonshowdown.com/sprites/trainers/' + avatar + '.png" alt="" width="80" height="80" />');
		}
	},

	logout: function (target, room, user) {
		user.resetName();
	},

	requesthelp: 'report',
	report: function (target, room, user) {
		this.sendReply("Use the Help room.");
	},

	r: 'reply',
	reply: function (target, room, user) {
		if (!target) return this.parse('/help reply');
		if (!user.lastPM) {
			return this.sendReply("No one has PMed you yet.");
		}
		return this.parse('/msg ' + (user.lastPM || '') + ', ' + target);
	},

	pm: 'msg',
	whisper: 'msg',
	w: 'msg',
	msg: function (target, room, user, connection) {
		if (!target) return this.parse('/help msg');
		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!target) {
			this.sendReply("You forgot the comma.");
			return this.parse('/help msg');
		}
		if (!targetUser || !targetUser.connected) {
			if (targetUser && !targetUser.connected) {
				this.popupReply("User " + this.targetUsername + " is offline.");
			} else if (!target) {
				this.popupReply("User " + this.targetUsername + " not found. Did you forget a comma?");
			} else {
				this.popupReply("User "  + this.targetUsername + " not found. Did you misspell their name?");
			}
			return this.parse('/help msg');
		}

		if (Config.modchat.pm) {
			var userGroup = user.group;
			if (Config.groups.bySymbol[userGroup].rank < Config.groups.bySymbol[Config.modchat.pm].rank) {
				var groupName = Config.groups.bySymbol[Config.modchat.pm].name || Config.modchat.pm;
				this.popupReply("Because moderated chat is set, you must be of rank " + groupName + " or higher to PM users.");
				return false;
			}
		}

		if (user.locked && !targetUser.can('lock')) {
			return this.popupReply("You can only private message members of the moderation team (users marked by " + Users.getGroupsThatCan('lock').join(", ") + ") when locked.");
		}
		if (targetUser.locked && !user.can('lock')) {
			return this.popupReply("This user is locked and cannot PM.");
		}
		if (targetUser.ignorePMs && !user.can('lock')) {
			if (!targetUser.can('lock')) {
				return this.popupReply("This user is blocking Private Messages right now.");
			} else if (targetUser.can('bypassall')) {
				return this.popupReply("This " + (Config.groups.bySymbol[targetUser.group].name || "Administrator") + " is too busy to answer Private Messages right now. Please contact a different staff member.");
			}
		}

		target = this.canTalk(target, null);
		if (!target) return false;

		if (target.charAt(0) === '/' && target.charAt(1) !== '/') {
			// PM command
			var targetCmdIndex = target.indexOf(' ');
			var targetCmd = (targetCmdIndex >= 0 ? target.slice(1, targetCmdIndex) : target.slice(1));
			switch (targetCmd) {
			case 'me':
			case 'announce':
			case 'invite':
				break;
			default:
				return connection.send('|pm|' + user.getIdentity() + '|' + targetUser.getIdentity() + "|/text The command '/" + targetCmd + "' was unrecognized or unavailable in private messages. To send a message starting with '/" + targetCmd + "', type '//" + targetCmd + "'.");
			}
		}

		var message = '|pm|' + user.getIdentity() + '|' + targetUser.getIdentity() + '|' + target;
		user.send(message);
		if (targetUser !== user) targetUser.send(message);
		targetUser.lastPM = user.userid;
		user.lastPM = targetUser.userid;
	},

	blockpm: 'ignorepms',
	blockpms: 'ignorepms',
	ignorepm: 'ignorepms',
	ignorepms: function (target, room, user) {
		if (user.ignorePMs) return this.sendReply("You are already blocking Private Messages!");
		if (user.can('lock') && !user.can('bypassall')) return this.sendReply("You are not allowed to block Private Messages.");
		user.ignorePMs = true;
		return this.sendReply("You are now blocking Private Messages.");
	},

	unblockpm: 'unignorepms',
	unblockpms: 'unignorepms',
	unignorepm: 'unignorepms',
	unignorepms: function (target, room, user) {
		if (!user.ignorePMs) return this.sendReply("You are not blocking Private Messages!");
		user.ignorePMs = false;
		return this.sendReply("You are no longer blocking Private Messages.");
	},

	makechatroom: function (target, room, user) {
		if (!this.can('makeroom')) return;
		var id = toId(target);
		if (!id) return this.parse('/help makechatroom');
		if (Rooms.rooms[id]) return this.sendReply("The room '" + target + "' already exists.");
		if (Rooms.global.addChatRoom(target)) {
			return this.sendReply("The room '" + target + "' was created.");
		}
		return this.sendReply("An error occurred while trying to create the room '" + target + "'.");
	},

	deregisterchatroom: function (target, room, user) {
		if (!this.can('makeroom')) return;
		var id = toId(target);
		if (!id) return this.parse('/help deregisterchatroom');
		var targetRoom = Rooms.search(id);
		if (!targetRoom) return this.sendReply("The room '" + target + "' doesn't exist.");
		target = targetRoom.title || targetRoom.id;
		if (Rooms.global.deregisterChatRoom(id)) {
			this.sendReply("The room '" + target + "' was deregistered.");
			this.sendReply("It will be deleted as of the next server restart.");
			return;
		}
		return this.sendReply("The room '" + target + "' isn't registered.");
	},

	privateroom: function (target, room, user) {
		if (!user.can('privateroom', room) && !user.can('privateroom')) return this.sendReply("/privateroom - Access denied.");
		if (target === 'off') {
			delete room.isPrivate;
			this.addModCommand("" + user.name + " made this room public.");
			if (room.chatRoomData) {
				delete room.chatRoomData.isPrivate;
				Rooms.global.writeChatRoomData();
			}
		} else {
			room.isPrivate = true;
			this.addModCommand("" + user.name + " made this room private.");
			if (room.chatRoomData) {
				room.chatRoomData.isPrivate = true;
				Rooms.global.writeChatRoomData();
			}
		}
	},

	modjoin: function (target, room, user) {
		if (!this.can('privateroom', room) && !this.can('privateroom')) return;
		if (target === 'off' || target === 'false') {
			delete room.modjoin;
			this.addModCommand("" + user.name + " turned off modjoin.");
			if (room.chatRoomData) {
				delete room.chatRoomData.modjoin;
				Rooms.global.writeChatRoomData();
			}
		} else {
			if (Config.groups[room.auth ? room.type + 'Room' : 'global'][target]) {
				room.modjoin = target;
				this.addModCommand("" + user.name + " set modjoin to " + target + ".");
			} else if (target === 'on' || target === 'true' || !target) {
				room.modjoin = true;
				this.addModCommand("" + user.name + " turned on modjoin.");
			} else {
				this.sendReply("Unrecognized modjoin setting.");
				return false;
			}
			if (room.chatRoomData) {
				room.chatRoomData.modjoin = true;
				Rooms.global.writeChatRoomData();
			}
			if (!room.modchat) this.parse('/modchat ' + Config.groups.default[room.type + 'Room']);
			if (!room.isPrivate) this.parse('/privateroom');
		}
	},

	officialchatroom: 'officialroom',
	officialroom: function (target, room, user) {
		if (!this.can('makeroom')) return;
		if (!room.chatRoomData) {
			return this.sendReply("/officialroom - This room can't be made official");
		}
		if (target === 'off') {
			delete room.isOfficial;
			this.addModCommand("" + user.name + " made this chat room unofficial.");
			delete room.chatRoomData.isOfficial;
			Rooms.global.writeChatRoomData();
		} else {
			room.isOfficial = true;
			this.addModCommand("" + user.name + " made this chat room official.");
			room.chatRoomData.isOfficial = true;
			Rooms.global.writeChatRoomData();
		}
	},

	roomdesc: function (target, room, user) {
		if (!target) {
			if (!this.canBroadcast()) return;
			var re = /(https?:\/\/(([-\w\.]+)+(:\d+)?(\/([\w/_\.]*(\?\S+)?)?)?))/g;
			if (!room.desc) return this.sendReply("This room does not have a description set.");
			this.sendReplyBox("The room description is: " + room.desc.replace(re, '<a href="$1">$1</a>'));
			return;
		}
		if (!this.can('roomdesc', room)) return false;
		if (target.length > 80) return this.sendReply("Error: Room description is too long (must be at most 80 characters).");
		var normalizedTarget = ' ' + target.toLowerCase().replace('[^a-zA-Z0-9]+', ' ').trim() + ' ';

		if (normalizedTarget.indexOf(' welcome ') >= 0) {
			return this.sendReply("Error: Room description must not contain the word 'welcome'.");
		}
		if (normalizedTarget.slice(0, 9) === ' discuss ') {
			return this.sendReply("Error: Room description must not start with the word 'discuss'.");
		}
		if (normalizedTarget.slice(0, 12) === ' talk about ' || normalizedTarget.slice(0, 17) === ' talk here about ') {
			return this.sendReply("Error: Room description must not start with the phrase 'talk about'.");
		}

		room.desc = target;
		this.sendReply("(The room description is now: " + target + ")");

		this.privateModCommand("(" + user.name + " changed the roomdesc to: \"" + target + "\".)");

		if (room.chatRoomData) {
			room.chatRoomData.desc = room.desc;
			Rooms.global.writeChatRoomData();
		}
	},

	roomintro: function (target, room, user) {
		if (!target) {
			if (!this.canBroadcast()) return;
			if (!room.introMessage) return this.sendReply("This room does not have an introduction set.");
			this.sendReplyBox(room.introMessage);
			if (!this.broadcasting && user.can('roomintro', room)) {
				this.sendReply("Source:");
				this.sendReplyBox('<code>' + Tools.escapeHTML(room.introMessage) + '</code>');
			}
			return;
		}
		if (!this.can('roomintro', room)) return false;
		if (!this.canHTML(target)) return;
		if (!/</.test(target)) {
			// not HTML, do some simple URL linking
			var re = /(https?:\/\/(([-\w\.]+)+(:\d+)?(\/([\w/_\.]*(\?\S+)?)?)?))/g;
			target = target.replace(re, '<a href="$1">$1</a>');
		}

		if (!target.trim()) target = '';
		room.introMessage = target;
		this.sendReply("(The room introduction has been changed to:)");
		this.sendReplyBox(target);

		this.privateModCommand("(" + user.name + " changed the roomintro.)");

		if (room.chatRoomData) {
			room.chatRoomData.introMessage = room.introMessage;
			Rooms.global.writeChatRoomData();
		}
	},

	roomalias: function (target, room, user) {
		if (!room.chatRoomData) return this.sendReply("This room isn't designed for aliases.");
		if (!target) {
			if (!room.chatRoomData.aliases || !room.chatRoomData.aliases.length) return this.sendReplyBox("This room does not have any aliases.");
			return this.sendReplyBox("This room has the following aliases: " + room.chatRoomData.aliases.join(", ") + "");
		}
		if (!this.can('setalias')) return false;
		var alias = toId(target);
		if (!alias.length) return this.sendReply("Only alphanumeric characters are valid in an alias.");
		if (Rooms.get(alias) || Rooms.aliases[alias]) return this.sendReply("You cannot set an alias to an existing room or alias.");

		this.privateModCommand("(" + user.name + " added the room alias '" + target + "'.)");

		if (!room.chatRoomData.aliases) room.chatRoomData.aliases = [];
		room.chatRoomData.aliases.push(alias);
		Rooms.aliases[alias] = room;
		Rooms.global.writeChatRoomData();
	},

	removeroomalias: function (target, room, user) {
		if (!room.chatRoomData) return this.sendReply("This room isn't designed for aliases.");
		if (!room.chatRoomData.aliases) return this.sendReply("This room does not have any aliases.");
		if (!this.can('setalias')) return false;
		var alias = toId(target);
		if (!alias.length || !Rooms.aliases[alias]) return this.sendReply("Please specify an existing alias.");
		if (Rooms.aliases[alias] !== room) return this.sendReply("You may only remove an alias from the current room.");

		this.privateModCommand("(" + user.name + " removed the room alias '" + target + "'.)");

		var aliasIndex = room.chatRoomData.aliases.indexOf(alias);
		if (aliasIndex >= 0) {
			room.chatRoomData.aliases.splice(aliasIndex, 1);
			delete Rooms.aliases[alias];
			Rooms.global.writeChatRoomData();
		}
	},

	roomdemote: 'roompromote',
	roompromote: function (target, room, user, connection, cmd) {
		if (!target) return this.parse('/help roompromote');

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var userid = toId(this.targetUsername);
		var name = targetUser ? targetUser.name : this.targetUsername;

		if (!userid) return this.parse('/help roompromote');
		if (!targetUser && (!room.auth || !room.auth[userid])) {
			return this.sendReply("User '" + name + "' is offline and unauthed, and so can't be promoted.");
		}

		var currentGroup = ((room.auth && room.auth[userid]) || Config.groups.default[room.type + 'Room'])[0];
		var nextGroup = Config.groups.default[room.type + 'Room'];
		if (target !== 'deauth') {
			var isDemote = cmd === 'roomdemote';
			var nextGroupRank = Config.groups.bySymbol[currentGroup][room.type + 'RoomRank'] + (isDemote ? -1 : 1);
			nextGroup = target || Config.groups[room.type + 'RoomByRank'][nextGroupRank] || (isDemote ? Config.groups.default[room.type + 'Room'] : Config.groups[room.type + 'RoomByRank'].slice(-1)[0]);
		}
		if (!Config.groups.bySymbol[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist.");
		}
		if (!Config.groups[room.type + 'Room'][nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist as a room rank.");
		}

		if (!room.auth && nextGroup !== Config.groups[room.type + 'RoomByRank'].slice(-1)[0]) {
			this.sendReply("/roompromote - This room isn't designed for per-room moderation");
			return this.sendReply("Before setting room auth, you need to set it up with /room" + Config.groups.bySymbol[Config.groups[room.type + 'RoomByRank'].slice(-1)[0]].id);
		}

		var groupName = Config.groups.bySymbol[nextGroup].name || "regular user";
		if (currentGroup === nextGroup) {
			return this.sendReply("User '" + name + "' is already a " + groupName + " in this room.");
		}
		if (!user.can('makeroom')) {
			if (!user.can('roompromote', currentGroup, room)) {
				return this.sendReply("/" + cmd + " - Access denied for removing " + ((Config.groups.bySymbol[currentGroup] ? Config.groups.bySymbol[currentGroup].name : "an undefined group") || "regular user") + ".");
			}
			if (!user.can('roompromote', nextGroup, room)) {
				return this.sendReply("/" + cmd + " - Access denied for giving " + groupName + ".");
			}
		}

		if (!room.auth) room.auth = room.chatRoomData.auth = {};
		if (nextGroup === Config.groups.default[room.type + 'Room']) {
			delete room.auth[userid];
		} else {
			room.auth[userid] = nextGroup;
		}

		if (Config.groups.bySymbol[nextGroup].rank < Config.groups.bySymbol[currentGroup].rank) {
			this.privateModCommand("(" + name + " was demoted to Room " + groupName + " by " + user.name + ".)");
			if (targetUser && Rooms.rooms[room.id].users[targetUser.userid]) targetUser.popup("You were demoted to Room " + groupName + " by " + user.name + ".");
		} else if (nextGroup === '#') {
			this.addModCommand("" + name + " was promoted to " + groupName + " by " + user.name + ".");
		} else {
			this.addModCommand("" + name + " was promoted to Room " + groupName + " by " + user.name + ".");
		}

		if (targetUser) targetUser.updateIdentity();
		if (room.chatRoomData) Rooms.global.writeChatRoomData();
	},

	roomauth: function (target, room, user, connection) {
		var targetRoom = room;
		if (target) targetRoom = Rooms.search(target);
		if (!targetRoom || (targetRoom !== room && targetRoom.modjoin && !user.can('bypassall'))) return this.sendReply("The room '" + target + "' does not exist.");
		if (!targetRoom.auth) return this.sendReply("/roomauth - The room '" + (targetRoom.title ? targetRoom.title : target) + "' isn't designed for per-room moderation and therefore has no auth list.");

		var rankLists = {};
		for (var u in targetRoom.auth) {
			if (!rankLists[targetRoom.auth[u]]) rankLists[targetRoom.auth[u]] = [];
			rankLists[targetRoom.auth[u]].push(u);
		}

		var buffer = [];
		Object.keys(rankLists).sort(function (a, b) {
			return (Config.groups.bySymbol[b] || {rank: 0}).rank - (Config.groups.bySymbol[a] || {rank: 0}).rank;
		}).forEach(function (r) {
			buffer.push((Config.groups.bySymbol[r] ? Config.groups.bySymbol[r].name + "s (" + r + ")" : r) + ":\n" + rankLists[r].sort().join(", "));
		});

		if (!buffer.length) {
			connection.popup("The room '" + targetRoom.title + "' has no auth.");
			return;
		}
		if (targetRoom !== room) buffer.unshift("" + targetRoom.title + " room auth:");
		connection.popup(buffer.join("\n\n"));
	},

	userauth: function (target, room, user, connection) {
		var targetId = toId(target) || user.userid;
		var targetUser = Users.getExact(targetId);
		var targetUsername = (targetUser ? targetUser.name : target);

		var buffer = [];
		var innerBuffer = [];
		var group = Users.usergroups[targetId];
		if (group) {
			buffer.push('Global auth: ' + group.charAt(0));
		}
		for (var i = 0; i < Rooms.global.chatRooms.length; i++) {
			var curRoom = Rooms.global.chatRooms[i];
			if (!curRoom.auth || curRoom.isPrivate) continue;
			group = curRoom.auth[targetId];
			if (!group) continue;
			innerBuffer.push(group + curRoom.id);
		}
		if (innerBuffer.length) {
			buffer.push('Room auth: ' + innerBuffer.join(', '));
		}
		if (targetId === user.userid || user.can('makeroom')) {
			innerBuffer = [];
			for (var i = 0; i < Rooms.global.chatRooms.length; i++) {
				var curRoom = Rooms.global.chatRooms[i];
				if (!curRoom.auth || !curRoom.isPrivate) continue;
				var auth = curRoom.auth[targetId];
				if (!auth) continue;
				innerBuffer.push(auth + curRoom.id);
			}
			if (innerBuffer.length) {
				buffer.push('Private room auth: ' + innerBuffer.join(', '));
			}
		}
		if (!buffer.length) {
			buffer.push("No global or room auth.");
		}

		buffer.unshift("" + targetUsername + " user auth:");
		connection.popup(buffer.join("\n\n"));
	},

	rb: 'roomban',
	roomban: function (target, room, user, connection) {
		if (!target) return this.parse('/help roomban');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var name = this.targetUsername;
		var userid = toId(name);

		if (!userid || !targetUser) return this.sendReply("User '" + name + "' does not exist.");
		if (!this.can('ban', targetUser, room)) return false;
		if (!room.bannedUsers || !room.bannedIps) {
			return this.sendReply("Room bans are not meant to be used in room " + room.id + ".");
		}
		if (room.bannedUsers[userid] || room.bannedIps[targetUser.latestIp]) return this.sendReply("User " + targetUser.name + " is already banned from room " + room.id + ".");
		room.bannedUsers[userid] = true;
		for (var ip in targetUser.ips) {
			room.bannedIps[ip] = true;
		}
		targetUser.popup("" + user.name + " has banned you from the room " + room.id + "." + (target ? "\n\nReason: " + target + ""  : "") + "\n\nTo appeal the ban, PM the staff member that banned you or a room owner. If you are unsure who the room owners are, type this into any room: /roomauth " + room.id);
		this.addModCommand("" + targetUser.name + " was banned from room " + room.id + " by " + user.name + "." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) {
			this.privateModCommand("(" + targetUser.name + "'s alts were also banned from room " + room.id + ": " + alts.join(", ") + ")");
			for (var i = 0; i < alts.length; ++i) {
				var altId = toId(alts[i]);
				this.add('|unlink|' + altId);
				room.bannedUsers[altId] = true;
				Users.getExact(altId).leaveRoom(room.id);
			}
		}
		this.add('|unlink|' + this.getLastIdOf(targetUser));
		if (!targetUser.can('bypassall')) targetUser.leaveRoom(room.id);
	},

	unroomban: 'roomunban',
	roomunban: function (target, room, user, connection) {
		if (!target) return this.parse('/help roomunban');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var name = this.targetUsername;
		var userid = toId(name);
		var success;

		if (!userid || !targetUser) return this.sendReply("User '" + name + "' does not exist.");
		if (!this.can('ban', targetUser, room)) return false;
		if (!room.bannedUsers || !room.bannedIps) {
			return this.sendReply("Room bans are not meant to be used in room " + room.id + ".");
		}
		if (room.bannedUsers[userid]) {
			delete room.bannedUsers[userid];
			success = true;
		}
		for (var ip in targetUser.ips) {
			if (room.bannedIps[ip]) {
				delete room.bannedIps[ip];
				success = true;
			}
		}
		if (!success) return this.sendReply("User " + targetUser.name + " is not banned from room " + room.id + ".");

		targetUser.popup("" + user.name + " has unbanned you from the room " + room.id + ".");
		this.addModCommand("" + targetUser.name + " was unbanned from room " + room.id + " by " + user.name + ".");
		var alts = targetUser.getAlts();
		if (!alts.length) return;
		for (var i = 0; i < alts.length; ++i) {
			var altId = toId(alts[i]);
			if (room.bannedUsers[altId]) delete room.bannedUsers[altId];
		}
		this.privateModCommand("(" + targetUser.name + "'s alts were also unbanned from room " + room.id + ": " + alts.join(", ") + ")");
	},

	autojoin: function (target, room, user, connection) {
		Rooms.global.autojoinRooms(user, connection);
	},

	joim: 'join',
	join: function (target, room, user, connection) {
		if (!target) return false;
		var targetRoom = Rooms.search(target);
		if (!targetRoom) {
			return connection.sendTo(target, "|noinit|nonexistent|The room '" + target + "' does not exist.");
		}
		if (targetRoom.isPrivate) {
			if (targetRoom.modjoin && !user.can('bypassall')) {
				var userGroup = user.group;
				if (targetRoom.auth) {
					userGroup = targetRoom.auth[user.userid] || Config.groups.default[room.type + 'Room'];
				}
				var modjoinLevel = targetRoom.modjoin !== true ? targetRoom.modjoin : targetRoom.modchat;
				if (modjoinLevel && Config.groups.bySymbol[userGroup].rank < Config.groups.bySymbol[modjoinLevel].rank) {
					return connection.sendTo(target, "|noinit|nonexistent|The room '" + target + "' does not exist.");
				}
			}
			if (!user.named) {
				return connection.sendTo(target, "|noinit|namerequired|You must have a name in order to join the room '" + target + "'.");
			}
		}

		var joinResult = user.joinRoom(targetRoom, connection);
		if (!joinResult) {
			if (joinResult === null) {
				return connection.sendTo(target, "|noinit|joinfailed|You are banned from the room '" + target + "'.");
			}
			return connection.sendTo(target, "|noinit|joinfailed|You do not have permission to join '" + target + "'.");
		}
	},

	leave: 'part',
	part: function (target, room, user, connection) {
		if (room.id === 'global') return false;
		var targetRoom = Rooms.search(target);
		if (target && !targetRoom) {
			return this.sendReply("The room '" + target + "' does not exist.");
		}
		user.leaveRoom(targetRoom || room, connection);
	},

	/*********************************************************
	 * Moderating: Punishments
	 *********************************************************/

	kick: 'warn',
	k: 'warn',
	warn: function (target, room, user) {
		if (!target) return this.parse('/help warn');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser || !targetUser.connected) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (room.isPrivate && room.auth) {
			return this.sendReply("You can't warn here: This is a privately-owned room not subject to global rules.");
		}
		if (!Rooms.rooms[room.id].users[targetUser.userid]) {
			return this.sendReply("User " + this.targetUsername + " is not in the room " + room.id + ".");
		}
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('warn', targetUser, room)) return false;

		this.addModCommand("" + targetUser.name + " was warned by " + user.name + "." + (target ? " (" + target + ")" : ""));
		targetUser.send('|c|~|/warn ' + target);
		this.add('|unlink|' + this.getLastIdOf(targetUser));
	},

	redirect: 'redir',
	redir: function (target, room, user, connection) {
		if (!target) return this.parse('/help redirect');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		var targetRoom = Rooms.search(target);
		if (!targetRoom) {
			return this.sendReply("The room '" + target + "' does not exist.");
		}
		if (!this.can('redirect', targetUser, room) || !this.can('redirect', targetUser, targetRoom)) return false;
		if (!targetUser || !targetUser.connected) {
			return this.sendReply("User " + this.targetUsername + " not found.");
		}
		if (Rooms.rooms[targetRoom.id].users[targetUser.userid]) {
			return this.sendReply("User " + targetUser.name + " is already in the room " + targetRoom.title + "!");
		}
		if (!Rooms.rooms[room.id].users[targetUser.userid]) {
			return this.sendReply("User " + this.targetUsername + " is not in the room " + room.id + ".");
		}
		if (targetUser.joinRoom(targetRoom.id) === false) return this.sendReply("User " + targetUser.name + " could not be joined to room " + targetRoom.title + ". They could be banned from the room.");
		var roomName = (targetRoom.isPrivate)? "a private room" : "room " + targetRoom.title;
		this.addModCommand("" + targetUser.name + " was redirected to " + roomName + " by " + user.name + ".");
		targetUser.leaveRoom(room);
	},

	m: 'mute',
	mute: function (target, room, user) {
		if (!target) return this.parse('/help mute');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('mute', targetUser, room)) return false;
		if (targetUser.mutedRooms[room.id] || targetUser.locked || !targetUser.connected) {
			var problem = " but was already " + (!targetUser.connected ? "offline" : targetUser.locked ? "locked" : "muted");
			if (!target) {
				return this.privateModCommand("(" + targetUser.name + " would be muted by " + user.name + problem + ".)");
			}
			return this.addModCommand("" + targetUser.name + " would be muted by " + user.name + problem + "." + (target ? " (" + target + ")" : ""));
		}

		targetUser.popup("" + user.name + " has muted you for 7 minutes. " + (target ? "\n\nReason: " + target : ""));
		this.addModCommand("" + targetUser.name + " was muted by " + user.name + " for 7 minutes." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) this.privateModCommand("(" + targetUser.name + "'s alts were also muted: " + alts.join(", ") + ")");
		this.add('|unlink|' + this.getLastIdOf(targetUser));

		targetUser.mute(room.id, 7 * 60 * 1000);
	},

	hm: 'hourmute',
	hourmute: function (target, room, user) {
		if (!target) return this.parse('/help hourmute');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('mute', targetUser, room)) return false;

		if (((targetUser.mutedRooms[room.id] && (targetUser.muteDuration[room.id] || 0) >= 50 * 60 * 1000) || targetUser.locked) && !target) {
			var problem = " but was already " + (!targetUser.connected ? "offline" : targetUser.locked ? "locked" : "muted");
			return this.privateModCommand("(" + targetUser.name + " would be muted by " + user.name + problem + ".)");
		}

		targetUser.popup("" + user.name + " has muted you for 60 minutes. " + (target ? "\n\nReason: " + target : ""));
		this.addModCommand("" + targetUser.name + " was muted by " + user.name + " for 60 minutes." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) this.privateModCommand("(" + targetUser.name + "'s alts were also muted: " + alts.join(", ") + ")");
		this.add('|unlink|' + this.getLastIdOf(targetUser));

		targetUser.mute(room.id, 60 * 60 * 1000, true);
	},

	um: 'unmute',
	unmute: function (target, room, user) {
		if (!target) return this.parse('/help unmute');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		var targetUser = Users.get(target);
		if (!targetUser) return this.sendReply("User '" + target + "' does not exist.");
		if (!this.can('mute', targetUser, room)) return false;

		if (!targetUser.mutedRooms[room.id]) {
			return this.sendReply("" + targetUser.name + " is not muted.");
		}

		this.addModCommand("" + targetUser.name + " was unmuted by " + user.name + ".");

		targetUser.unmute(room.id);
	},

	l: 'lock',
	ipmute: 'lock',
	lock: function (target, room, user) {
		if (!target) return this.parse('/help lock');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('lock', targetUser)) return false;

		if ((targetUser.locked || Users.checkBanned(targetUser.latestIp)) && !target) {
			var problem = " but was already " + (targetUser.locked ? "locked" : "banned");
			return this.privateModCommand("(" + targetUser.name + " would be locked by " + user.name + problem + ".)");
		}

		targetUser.popup("" + user.name + " has locked you from talking in chats, battles, and PMing regular users." + (target ? "\n\nReason: " + target : "") + "\n\nIf you feel that your lock was unjustified, you can still PM staff members (" + Users.getGroupsThatCan('lock', user).join(", ") + ") to discuss it" + (Config.appealurl ? " or you can appeal:\n" + Config.appealurl : ".") + "\n\nYour lock will expire in a few days.");

		this.addModCommand("" + targetUser.name + " was locked from talking by " + user.name + "." + (target ? " (" + target + ")" : ""));
		var alts = targetUser.getAlts();
		if (alts.length) {
			this.privateModCommand("(" + targetUser.name + "'s " + (targetUser.autoconfirmed ? " ac account: " + targetUser.autoconfirmed + ", " : "") + "locked alts: " + alts.join(", ") + ")");
		} else if (targetUser.autoconfirmed) {
			this.privateModCommand("(" + targetUser.name + "'s ac account: " + targetUser.autoconfirmed + ")");
		}
		this.add('|unlink|' + this.getLastIdOf(targetUser));

		targetUser.lock();
	},

	unlock: function (target, room, user) {
		if (!target) return this.parse('/help unlock');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		if (!this.can('lock')) return false;

		var unlocked = Users.unlock(target);

		if (unlocked) {
			var names = Object.keys(unlocked);
			this.addModCommand(names.join(", ") + " " +
				((names.length > 1) ? "were" : "was") +
				" unlocked by " + user.name + ".");
		} else {
			this.sendReply("User '" + target + "' is not locked.");
		}
	},

	b: 'ban',
	ban: function (target, room, user) {
		if (!target) return this.parse('/help ban');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' does not exist.");
		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The reason is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('ban', targetUser)) return false;

		if (Users.checkBanned(targetUser.latestIp) && !target && !targetUser.connected) {
			var problem = " but was already banned";
			return this.privateModCommand("(" + targetUser.name + " would be banned by " + user.name + problem + ".)");
		}

		targetUser.popup("" + user.name + " has banned you." + (target ? "\n\nReason: " + target : "") + (Config.appealurl ? "\n\nIf you feel that your ban was unjustified, you can appeal:\n" + Config.appealurl : "") + "\n\nYour ban will expire in a few days.");

		this.addModCommand("" + targetUser.name + " was banned by " + user.name + "." + (target ? " (" + target + ")" : ""), " (" + targetUser.latestIp + ")");
		var alts = targetUser.getAlts();
		if (alts.length) {
			this.privateModCommand("(" + targetUser.name + "'s " + (targetUser.autoconfirmed ? " ac account: " + targetUser.autoconfirmed + ", " : "") + "banned alts: " + alts.join(", ") + ")");
			for (var i = 0; i < alts.length; ++i) {
				this.add('|unlink|' + toId(alts[i]));
			}
		} else if (targetUser.autoconfirmed) {
			this.privateModCommand("(" + targetUser.name + "'s ac account: " + targetUser.autoconfirmed + ")");
		}

		this.add('|unlink|' + this.getLastIdOf(targetUser));
		targetUser.ban();
	},

	unban: function (target, room, user) {
		if (!target) return this.parse('/help unban');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		if (!this.can('ban')) return false;

		var name = Users.unban(target);

		if (name) {
			this.addModCommand("" + name + " was unbanned by " + user.name + ".");
		} else {
			this.sendReply("User '" + target + "' is not banned.");
		}
	},

	unbanall: function (target, room, user) {
		if (!this.can('rangeban')) return false;
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		// we have to do this the hard way since it's no longer a global
		for (var i in Users.bannedIps) {
			delete Users.bannedIps[i];
		}
		for (var i in Users.lockedIps) {
			delete Users.lockedIps[i];
		}
		this.addModCommand("All bans and locks have been lifted by " + user.name + ".");
	},

	banip: function (target, room, user) {
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		target = target.trim();
		if (!target) {
			return this.parse('/help banip');
		}
		if (!this.can('rangeban')) return false;
		if (Users.bannedIps[target] === '#ipban') return this.sendReply("The IP " + (target.charAt(target.length - 1) === '*' ? "range " : "") + target + " has already been temporarily banned.");

		Users.bannedIps[target] = '#ipban';
		this.addModCommand("" + user.name + " temporarily banned the " + (target.charAt(target.length - 1) === '*' ? "IP range" : "IP") + ": " + target);
	},

	unbanip: function (target, room, user) {
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		target = target.trim();
		if (!target) {
			return this.parse('/help unbanip');
		}
		if (!this.can('rangeban')) return false;
		if (!Users.bannedIps[target]) {
			return this.sendReply("" + target + " is not a banned IP or IP range.");
		}
		delete Users.bannedIps[target];
		this.addModCommand("" + user.name + " unbanned the " + (target.charAt(target.length - 1) === '*' ? "IP range" : "IP") + ": " + target);
	},

	rangelock: function (target, room, user) {
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		if (!target) return this.sendReply("Please specify a domain to lock.");
		if (!this.can('rangeban')) return false;

		var domain = Users.shortenHost(target);
		if (Users.lockedDomains[domain]) return this.sendReply("The domain " + domain + " has already been temporarily locked.");

		Users.lockDomain(domain);
		this.addModCommand("" + user.name + " temporarily locked the domain " + domain + ".");
	},

	rangeunlock: function (target, room, user) {
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		if (!target) return this.sendReply("Please specify a domain to unlock.");
		if (!this.can('rangeban')) return false;

		var domain = Users.shortenHost(target);
		if (!Users.lockedDomains[domain]) return this.sendReply("The domain " + domain + " is not locked.");

		Users.unlockDomain(domain);
		this.addModCommand("" + user.name + " unlocked the domain " + domain + ".");
	},

	/*********************************************************
	 * Moderating: Other
	 *********************************************************/

	mn: 'modnote',
	modnote: function (target, room, user, connection) {
		if (!target) return this.parse('/help modnote');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");

		if (target.length > MAX_REASON_LENGTH) {
			return this.sendReply("The note is too long. It cannot exceed " + MAX_REASON_LENGTH + " characters.");
		}
		if (!this.can('staff', room)) return false;
		return this.privateModCommand("(" + user.name + " notes: " + target + ")");
	},

	globaldemote: 'promote',
	globalpromote: 'promote',
	demote: 'promote',
	promote: function (target, room, user, connection, cmd) {
		if (!target) return this.parse('/help promote');

		target = this.splitTarget(target, true);
		var targetUser = this.targetUser;
		var userid = toId(this.targetUsername);
		var name = targetUser ? targetUser.name : this.targetUsername;

		if (!userid) return this.parse('/help promote');

		var currentGroup = ((targetUser && targetUser.group) || Users.usergroups[userid] || Config.groups.default.global)[0];
		var nextGroup = Config.groups.default.global;
		if (target !== 'deauth') {
			var isDemote = cmd === 'demote';
			var nextGroupRank = Config.groups.bySymbol[currentGroup].globalRank + (isDemote ? -1 : 1);
			nextGroup = target || Config.groups.globalByRank[nextGroupRank] || (isDemote ? Config.groups.default.global : Config.groups.globalByRank.slice(-1)[0]);
		}
		if (!Config.groups.bySymbol[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist.");
		}
		if (!Config.groups.global[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist as a global rank.");
		}

		var groupName = Config.groups.bySymbol[nextGroup].name || "regular user";
		if (currentGroup === nextGroup) {
			return this.sendReply("User '" + name + "' is already a " + groupName);
		}
		if (!user.can('promote', currentGroup)) {
			return this.sendReply("/" + cmd + " - Access denied for removing " + (Config.groups.bySymbol[currentGroup].name || "regular user") + ".");
		}
		if (!user.can('promote', nextGroup)) {
			return this.sendReply("/" + cmd + " - Access denied for giving " + groupName + ".");
		}

		if (!Users.setOfflineGroup(name, nextGroup)) {
			return this.sendReply("/promote - WARNING: This user is offline and could be unregistered. Use /forcepromote if you're sure you want to risk it.");
		}

		if (Config.groups.bySymbol[nextGroup].rank < Config.groups.bySymbol[currentGroup].rank) {
			this.privateModCommand("(" + name + " was demoted to " + groupName + " by " + user.name + ".)");
			if (targetUser) targetUser.popup("You were demoted to " + groupName + " by " + user.name + ".");
		} else {
			this.addModCommand("" + name + " was promoted to " + groupName + " by " + user.name + ".");
		}

		if (targetUser) targetUser.updateIdentity();
	},

	forcepromote: function (target, room, user) {
		// warning: never document this command in /help
		if (!this.can('forcepromote')) return false;
		target = this.splitTarget(target, true);
		var name = this.targetUsername;

		var nextGroupRank = Config.groups.bySymbol[Config.groups.default.global].globalRank + 1;
		var nextGroup = target || Config.groups.globalByRank[nextGroupRank] || Config.groups.globalByRank.slice(-1)[0];
		if (!Config.groups.bySymbol[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist.");
		}
		if (!Config.groups.global[nextGroup]) {
			return this.sendReply("Group '" + nextGroup + "' does not exist as a global rank.");
		}

		if (!Users.setOfflineGroup(name, nextGroup, true)) {
			return this.sendReply("/forcepromote - Don't forcepromote unless you have to.");
		}

		this.addModCommand("" + name + " was promoted to " + (Config.groups.bySymbol[nextGroup].name || "regular user") + " by " + user.name + ".");
	},

	deauth: function (target, room, user) {
		return this.parse('/demote ' + target + ', deauth');
	},

	deroomauth: 'roomdeauth',
	roomdeauth: function (target, room, user) {
		return this.parse('/roomdemote ' + target + ', deauth');
	},

	modchat: function (target, room, user) {
		if (!target) return this.sendReply("Moderated chat is currently set to: " + room.modchat);
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		if (!this.can('modchat', room)) return false;

		var roomType = room.auth ? room.type + 'Room' : 'global';
		if (room.modchat && Config.groups[roomType][room.modchat] && Config.groups.bySymbol[room.modchat][roomType + 'Rank'] > 1 && !user.can('modchatall', room)) {
			return this.sendReply("/modchat - Access denied for removing a setting higher than " + Config.groups[roomType + 'ByRank'][1] + ".");
		}

		target = target.toLowerCase();
		var currentModchat = room.modchat;
		switch (target) {
		case 'off':
		case 'false':
		case 'no':
		case ' ':
			room.modchat = false;
			break;
		case 'ac':
		case 'autoconfirmed':
			room.modchat = 'autoconfirmed';
			break;
		default:
			if (Config.groups.byId[target]) target = Config.groups.byId[target];
			if (!Config.groups[roomType][target]) return this.parse('/help modchat');
			if (Config.groups.bySymbol[target][roomType + 'Rank'] > 1 && !user.can('modchatall', room)) {
				return this.sendReply("/modchat - Access denied for setting higher than " + Config.groups[roomType + 'ByRank'][1] + ".");
			}
			room.modchat = target;
			break;
		}
		if (currentModchat === room.modchat) {
			return this.sendReply("Modchat is already set to " + currentModchat + ".");
		}
		if (!room.modchat) {
			this.add("|raw|<div class=\"broadcast-blue\"><b>Moderated chat was disabled!</b><br />Anyone may talk now.</div>");
		} else {
			var modchat = Tools.escapeHTML(room.modchat);
			this.add("|raw|<div class=\"broadcast-red\"><b>Moderated chat was set to " + modchat + "!</b><br />Only users of rank " + modchat + " and higher can talk.</div>");
		}
		this.logModCommand(user.name + " set modchat to " + room.modchat);

		if (room.chatRoomData) {
			room.chatRoomData.modchat = room.modchat;
			Rooms.global.writeChatRoomData();
		}
	},

	declare: function (target, room, user) {
		if (!target) return this.parse('/help declare');
		if (!this.can('declare', room)) return false;

		if (!this.canTalk()) return;

		this.add('|raw|<div class="broadcast-blue"><b>' + Tools.escapeHTML(target) + '</b></div>');
		this.logModCommand(user.name + " declared " + target);
	},

	htmldeclare: function (target, room, user) {
		if (!target) return this.parse('/help htmldeclare');
		if (!this.can('gdeclare', room)) return false;

		if (!this.canTalk()) return;

		this.add('|raw|<div class="broadcast-blue"><b>' + target + '</b></div>');
		this.logModCommand(user.name + " declared " + target);
	},

	gdeclare: 'globaldeclare',
	globaldeclare: function (target, room, user) {
		if (!target) return this.parse('/help globaldeclare');
		if (!this.can('gdeclare')) return false;

		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw('<div class="broadcast-blue"><b>' + target + '</b></div>');
		}
		this.logModCommand(user.name + " globally declared " + target);
	},

	cdeclare: 'chatdeclare',
	chatdeclare: function (target, room, user) {
		if (!target) return this.parse('/help chatdeclare');
		if (!this.can('gdeclare')) return false;

		for (var id in Rooms.rooms) {
			if (id !== 'global') if (Rooms.rooms[id].type !== 'battle') Rooms.rooms[id].addRaw('<div class="broadcast-blue"><b>' + target + '</b></div>');
		}
		this.logModCommand(user.name + " globally declared (chat level) " + target);
	},

	wall: 'announce',
	announce: function (target, room, user) {
		if (!target) return this.parse('/help announce');

		if (!this.can('announce', room)) return false;

		target = this.canTalk(target);
		if (!target) return;

		return '/announce ' + target;
	},

	fr: 'forcerename',
	forcerename: function (target, room, user) {
		if (!target) return this.parse('/help forcerename');
		if ((user.locked || user.mutedRooms[room.id]) && !user.can('bypassall')) return this.sendReply("You cannot do this while unable to talk.");
		var commaIndex = target.indexOf(',');
		var targetUser, reason;
		if (commaIndex !== -1) {
			reason = target.substr(commaIndex + 1).trim();
			target = target.substr(0, commaIndex);
		}
		targetUser = Users.get(target);
		if (!targetUser) return this.sendReply("User '" + this.targetUsername + "' not found.");
		if (!this.can('forcerename', targetUser)) return false;

		if (targetUser.userid !== toId(target)) {
			return this.sendReply("User '" + target + "' had already changed its name to '" + targetUser.name + "'.");
		}

		var entry = targetUser.name + " was forced to choose a new name by " + user.name + (reason ? ": " + reason : "");
		this.privateModCommand("(" + entry + ")");
		Rooms.global.cancelSearch(targetUser);
		targetUser.resetName();
		targetUser.send("|nametaken||" + user.name + " considers your name inappropriate" + (reason ? ": " + reason : "."));
	},

	modlog: function (target, room, user, connection) {
		var lines = 0;
		// Specific case for modlog command. Room can be indicated with a comma, lines go after the comma.
		// Otherwise, the text is defaulted to text search in current room's modlog.
		var roomId = room.id;
		var hideIps = !user.can('ban');
		var path = require('path');
		var isWin = process.platform === 'win32';
		var logPath = 'logs/modlog/';

		if (target.indexOf(',') > -1) {
			var targets = target.split(',');
			target = targets[1].trim();
			roomId = toId(targets[0]) || room.id;
		}

		// Let's check the number of lines to retrieve or if it's a word instead
		if (!target.match('[^0-9]')) {
			lines = parseInt(target || 15, 10);
			if (lines > 100) lines = 100;
		}
		var wordSearch = (!lines || lines < 0);

		// Control if we really, really want to check all modlogs for a word.
		var roomNames = '';
		var filename = '';
		var command = '';
		if (roomId === 'all' && wordSearch) {
			if (!this.can('staff')) return;
			roomNames = "all rooms";
			// Get a list of all the rooms
			var fileList = fs.readdirSync('logs/modlog');
			for (var i = 0; i < fileList.length; ++i) {
				filename += path.normalize(__dirname + '/' + logPath + fileList[i]) + ' ';
			}
		} else {
			if (!this.can('staff', Rooms.get(roomId))) return;
			roomNames = "the room " + roomId;
			filename = path.normalize(__dirname + '/' + logPath + 'modlog_' + roomId + '.txt');
		}

		// Seek for all input rooms for the lines or text
		if (isWin) {
			command = path.normalize(__dirname + '/lib/winmodlog') + ' tail ' + lines + ' ' + filename;
		} else {
			command = 'tail -' + lines + ' ' + filename;
		}
		var grepLimit = 100;
		if (wordSearch) { // searching for a word instead
			if (target.match(/^["'].+["']$/)) target = target.substring(1, target.length - 1);
			if (isWin) {
				command = path.normalize(__dirname + '/lib/winmodlog') + ' ws ' + grepLimit + ' "' + target.replace(/%/g, "%%").replace(/([\^"&<>\|])/g, "^$1") + '" ' + filename;
			} else {
				command = "awk '{print NR,$0}' " + filename + " | sort -nr | cut -d' ' -f2- | grep -m" + grepLimit + " -i '" + target.replace(/\\/g, '\\\\\\\\').replace(/["'`]/g, '\'\\$&\'').replace(/[\{\}\[\]\(\)\$\^\.\?\+\-\*]/g, '[$&]') + "'";
			}
		}

		// Execute the file search to see modlog
		require('child_process').exec(command, function (error, stdout, stderr) {
			if (error && stderr) {
				connection.popup("/modlog empty on " + roomNames + " or erred");
				console.log("/modlog error: " + error);
				return false;
			}
			if (stdout && hideIps) {
				stdout = stdout.replace(/\([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\)/g, '');
			}
			if (lines) {
				if (!stdout) {
					connection.popup("The modlog is empty. (Weird.)");
				} else {
					connection.popup("Displaying the last " + lines + " lines of the Moderator Log of " + roomNames + ":\n\n" + stdout);
				}
			} else {
				if (!stdout) {
					connection.popup("No moderator actions containing '" + target + "' were found on " + roomNames + ".");
				} else {
					connection.popup("Displaying the last " + grepLimit + " logged actions containing '" + target + "' on " + roomNames + ":\n\n" + stdout);
				}
			}
		});
	},

	/*********************************************************
	 * Server management commands
	 *********************************************************/

	hotpatch: function (target, room, user) {
		if (!target) return this.parse('/help hotpatch');
		if (!this.can('hotpatch')) return false;

		this.logEntry(user.name + " used /hotpatch " + target);

		if (target === 'chat' || target === 'commands') {
			try {
				CommandParser.uncacheTree('./command-parser.js');
				global.CommandParser = require('./command-parser.js');

				var runningTournaments = Tournaments.tournaments;
				CommandParser.uncacheTree('./tournaments');
				global.Tournaments = require('./tournaments');
				Tournaments.tournaments = runningTournaments;

				return this.sendReply("Chat commands have been hot-patched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch chat: \n" + e.stack);
			}
		} else if (target === 'tournaments') {
			try {
				var runningTournaments = Tournaments.tournaments;
				CommandParser.uncacheTree('./tournaments');
				global.Tournaments = require('./tournaments');
				Tournaments.tournaments = runningTournaments;
				return this.sendReply("Tournaments have been hot-patched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch tournaments: \n" + e.stack);
			}
		} else if (target === 'battles') {
			/*Simulator.SimulatorProcess.respawn();
			return this.sendReply("Battles have been hotpatched. Any battles started after now will use the new code; however, in-progress battles will continue to use the old code.");*/
			return this.sendReply("Battle hotpatching is not supported with the single process hack.");
		} else if (target === 'formats') {
			try {
				// uncache the tools.js dependency tree
				CommandParser.uncacheTree('./tools.js');
				// reload tools.js
				global.Tools = require('./tools.js'); // note: this will lock up the server for a few seconds
				// rebuild the formats list
				Rooms.global.formatListText = Rooms.global.getFormatListText();
				// respawn validator processes
				//TeamValidator.ValidatorProcess.respawn();
				global.battleProtoCache = {};
				// respawn simulator processes
				//Simulator.SimulatorProcess.respawn();
				// broadcast the new formats list to clients
				Rooms.global.send(Rooms.global.formatListText);

				return this.sendReply("Formats have been hotpatched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch formats: \n" + e.stack);
			}
		} else if (target === 'learnsets') {
			try {
				// uncache the tools.js dependency tree
				CommandParser.uncacheTree('./tools.js');
				// reload tools.js
				global.Tools = require('./tools.js'); // note: this will lock up the server for a few seconds

				return this.sendReply("Learnsets have been hotpatched.");
			} catch (e) {
				return this.sendReply("Something failed while trying to hotpatch learnsets: \n" + e.stack);
			}
		}
		this.sendReply("Your hot-patch command was unrecognized.");
	},

	savelearnsets: function (target, room, user) {
		if (!this.can('hotpatch')) return false;
		fs.writeFile('data/learnsets.js', 'exports.BattleLearnsets = ' + JSON.stringify(Tools.data.Learnsets) + ";\n");
		this.sendReply("learnsets.js saved.");
	},

	disableladder: function (target, room, user) {
		if (!this.can('disableladder')) return false;
		if (LoginServer.disabled) {
			return this.sendReply("/disableladder - Ladder is already disabled.");
		}
		LoginServer.disabled = true;
		this.logModCommand("The ladder was disabled by " + user.name + ".");
		this.add("|raw|<div class=\"broadcast-red\"><b>Due to high server load, the ladder has been temporarily disabled</b><br />Rated games will no longer update the ladder. It will be back momentarily.</div>");
	},

	enableladder: function (target, room, user) {
		if (!this.can('disableladder')) return false;
		if (!LoginServer.disabled) {
			return this.sendReply("/enable - Ladder is already enabled.");
		}
		LoginServer.disabled = false;
		this.logModCommand("The ladder was enabled by " + user.name + ".");
		this.add("|raw|<div class=\"broadcast-green\"><b>The ladder is now back.</b><br />Rated games will update the ladder now.</div>");
	},

	lockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		Rooms.global.lockdown = true;
		for (var id in Rooms.rooms) {
			if (id === 'global') continue;
			var curRoom = Rooms.rooms[id];
			curRoom.addRaw("<div class=\"broadcast-red\"><b>The server is restarting soon.</b><br />Please finish your battles quickly. No new battles can be started until the server resets in a few minutes.</div>");
			if (curRoom.requestKickInactive && !curRoom.battle.ended) {
				curRoom.requestKickInactive(user, true);
				if (!curRoom.modchat) {
					curRoom.modchat = Users.getGroupsThatCan('joinbattle', curRoom)[0];
					curRoom.addRaw("<div class=\"broadcast-red\"><b>Moderated chat was set to " + Users.getGroupsThatCan('joinbattle', curRoom)[0] + "!</b><br />Only users of rank " + Users.getGroupsThatCan('joinbattle', curRoom)[0] + " and higher can talk.</div>");
				}
			}
		}

		this.logEntry(user.name + " used /lockdown");
	},

	prelockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;
		Rooms.global.lockdown = 'pre';
		this.sendReply("Tournaments have been disabled in preparation for the server restart.");
		this.logEntry(user.name + " used /prelockdown");
	},

	slowlockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		Rooms.global.lockdown = true;
		for (var id in Rooms.rooms) {
			if (id === 'global') continue;
			var curRoom = Rooms.rooms[id];
			if (curRoom.battle) continue;
			curRoom.addRaw("<div class=\"broadcast-red\"><b>The server is restarting soon.</b><br />Please finish your battles quickly. No new battles can be started until the server resets in a few minutes.</div>");
		}

		this.logEntry(user.name + " used /slowlockdown");
	},

	endlockdown: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (!Rooms.global.lockdown) {
			return this.sendReply("We're not under lockdown right now.");
		}
		if (Rooms.global.lockdown === true) {
			for (var id in Rooms.rooms) {
				if (id !== 'global') Rooms.rooms[id].addRaw("<div class=\"broadcast-green\"><b>The server shutdown was canceled.</b></div>");
			}
		} else {
			this.sendReply("Preparation for the server shutdown was canceled.");
		}
		Rooms.global.lockdown = false;

		this.logEntry(user.name + " used /endlockdown");
	},

	emergency: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (Config.emergency) {
			return this.sendReply("We're already in emergency mode.");
		}
		Config.emergency = true;
		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw("<div class=\"broadcast-red\">The server has entered emergency mode. Some features might be disabled or limited.</div>");
		}

		this.logEntry(user.name + " used /emergency");
	},

	endemergency: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (!Config.emergency) {
			return this.sendReply("We're not in emergency mode.");
		}
		Config.emergency = false;
		for (var id in Rooms.rooms) {
			if (id !== 'global') Rooms.rooms[id].addRaw("<div class=\"broadcast-green\"><b>The server is no longer in emergency mode.</b></div>");
		}

		this.logEntry(user.name + " used /endemergency");
	},

	kill: function (target, room, user) {
		if (!this.can('lockdown')) return false;

		if (Rooms.global.lockdown !== true) {
			return this.sendReply("For safety reasons, /kill can only be used during lockdown.");
		}

		if (CommandParser.updateServerLock) {
			return this.sendReply("Wait for /updateserver to finish before using /kill.");
		}

		/*for (var i in Sockets.workers) {
			Sockets.workers[i].kill();
		}*/

		if (!room.destroyLog) {
			process.exit();
			return;
		}
		room.destroyLog(function () {
			room.logEntry(user.name + " used /kill");
		}, function () {
			process.exit();
		});

		// Just in the case the above never terminates, kill the process
		// after 10 seconds.
		setTimeout(function () {
			process.exit();
		}, 10000);
	},

	loadbanlist: function (target, room, user, connection) {
		if (!this.can('hotpatch')) return false;

		connection.sendTo(room, "Loading ipbans.txt...");
		fs.readFile('config/ipbans.txt', function (err, data) {
			if (err) return;
			data = ('' + data).split('\n');
			var rangebans = [];
			for (var i = 0; i < data.length; ++i) {
				var line = data[i].split('#')[0].trim();
				if (!line) continue;
				if (line.indexOf('/') >= 0) {
					rangebans.push(line);
				} else if (line && !Users.bannedIps[line]) {
					Users.bannedIps[line] = '#ipban';
				}
			}
			Users.checkRangeBanned = Cidr.checker(rangebans);
			connection.sendTo(room, "ipbans.txt has been reloaded.");
		});
	},

	refreshpage: function (target, room, user) {
		if (!this.can('refreshpage')) return false;
		Rooms.global.send('|refresh|');
		this.logEntry(user.name + " used /refreshpage");
	},

	updateserver: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/updateserver - Access denied.");
		}

		if (CommandParser.updateServerLock) {
			return this.sendReply("/updateserver - Another update is already in progress.");
		}

		CommandParser.updateServerLock = true;

		var logQueue = [];
		logQueue.push(user.name + " used /updateserver");

		connection.sendTo(room, "updating...");

		var exec = require('child_process').exec;
		exec('git diff-index --quiet HEAD --', function (error) {
			var cmd = 'git pull --rebase';
			if (error) {
				if (error.code === 1) {
					// The working directory or index have local changes.
					cmd = 'git stash && ' + cmd + ' && git stash pop';
				} else {
					// The most likely case here is that the user does not have
					// `git` on the PATH (which would be error.code === 127).
					connection.sendTo(room, "" + error);
					logQueue.push("" + error);
					logQueue.forEach(function (line) {
						room.logEntry(line);
					});
					CommandParser.updateServerLock = false;
					return;
				}
			}
			var entry = "Running `" + cmd + "`";
			connection.sendTo(room, entry);
			logQueue.push(entry);
			exec(cmd, function (error, stdout, stderr) {
				("" + stdout + stderr).split("\n").forEach(function (s) {
					connection.sendTo(room, s);
					logQueue.push(s);
				});
				logQueue.forEach(function (line) {
					room.logEntry(line);
				});
				CommandParser.updateServerLock = false;
			});
		});
	},

	crashfixed: function (target, room, user) {
		if (Rooms.global.lockdown !== true) {
			return this.sendReply('/crashfixed - There is no active crash.');
		}
		if (!this.can('hotpatch')) return false;

		Rooms.global.lockdown = false;
		if (Rooms.lobby) {
			Rooms.lobby.modchat = false;
			Rooms.lobby.addRaw("<div class=\"broadcast-green\"><b>We fixed the crash without restarting the server!</b><br />You may resume talking in the lobby and starting new battles.</div>");
		}
		this.logEntry(user.name + " used /crashfixed");
	},

	'memusage': 'memoryusage',
	memoryusage: function (target) {
		if (!this.can('hotpatch')) return false;
		target = toId(target) || 'all';
		if (target === 'all') {
			this.sendReply("Loading memory usage, this might take a while.");
		}
		var roomSize, configSize, rmSize, cpSize, simSize, usersSize, toolsSize;
		if (target === 'all' || target === 'rooms' || target === 'room') {
			this.sendReply("Calculating Room size...");
			roomSize = ResourceMonitor.sizeOfObject(Rooms);
			this.sendReply("Rooms are using " + roomSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'config') {
			this.sendReply("Calculating config size...");
			configSize = ResourceMonitor.sizeOfObject(Config);
			this.sendReply("Config is using " + configSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'resourcemonitor' || target === 'rm') {
			this.sendReply("Calculating Resource Monitor size...");
			rmSize = ResourceMonitor.sizeOfObject(ResourceMonitor);
			this.sendReply("The Resource Monitor is using " + rmSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'cmdp' || target === 'cp' || target === 'commandparser') {
			this.sendReply("Calculating Command Parser size...");
			cpSize = ResourceMonitor.sizeOfObject(CommandParser);
			this.sendReply("Command Parser is using " + cpSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'sim' || target === 'simulator') {
			this.sendReply("Calculating Simulator size...");
			simSize = ResourceMonitor.sizeOfObject(Simulator);
			this.sendReply("Simulator is using " + simSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'users') {
			this.sendReply("Calculating Users size...");
			usersSize = ResourceMonitor.sizeOfObject(Users);
			this.sendReply("Users is using " + usersSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'tools') {
			this.sendReply("Calculating Tools size...");
			toolsSize = ResourceMonitor.sizeOfObject(Tools);
			this.sendReply("Tools are using " + toolsSize + " bytes of memory.");
		}
		if (target === 'all' || target === 'v8') {
			this.sendReply("Retrieving V8 memory usage...");
			var o = process.memoryUsage();
			this.sendReply("Resident set size: " + o.rss + ", " + o.heapUsed + " heap used of " + o.heapTotal  + " total heap. " + (o.heapTotal - o.heapUsed) + " heap left.");
		}
		if (target === 'all') {
			this.sendReply("Calculating Total size...");
			var total = (roomSize + configSize + rmSize + cpSize + simSize + usersSize + toolsSize) || 0;
			var units = ["bytes", "K", "M", "G"];
			var converted = total;
			var unit = 0;
			while (converted > 1024) {
				converted /= 1024;
				++unit;
			}
			converted = Math.round(converted);
			this.sendReply("Total memory used: " + converted + units[unit] + " (" + total + " bytes).");
		}
		return;
	},

	bash: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/bash - Access denied.");
		}

		var exec = require('child_process').exec;
		exec(target, function (error, stdout, stderr) {
			connection.sendTo(room, ("" + stdout + stderr));
		});
	},

	eval: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/eval - Access denied.");
		}
		if (!this.canBroadcast()) return;

		if (!this.broadcasting) this.sendReply('||>> ' + target);
		try {
			var battle = room.battle;
			var me = user;
			this.sendReply('||<< ' + eval(target));
		} catch (e) {
			this.sendReply('||<< error: ' + e.message);
			var stack = '||' + ('' + e.stack).replace(/\n/g, '\n||');
			connection.sendTo(room, stack);
		}
	},

	evalbattle: function (target, room, user, connection) {
		if (!user.hasConsoleAccess(connection)) {
			return this.sendReply("/evalbattle - Access denied.");
		}
		if (!this.canBroadcast()) return;
		if (!room.battle) {
			return this.sendReply("/evalbattle - This isn't a battle room.");
		}

		room.battle.send('eval', target.replace(/\n/g, '\f'));
	},

	/*********************************************************
	 * Battle commands
	 *********************************************************/

	forfeit: function (target, room, user) {
		if (!room.battle) {
			return this.sendReply("There's nothing to forfeit here.");
		}
		if (!room.forfeit(user)) {
			return this.sendReply("You can't forfeit this battle.");
		}
	},

	savereplay: function (target, room, user, connection) {
		if (!room || !room.battle) return;
		var logidx = 2; // spectator log (no exact HP)
		if (room.battle.ended) {
			// If the battle is finished when /savereplay is used, include
			// exact HP in the replay log.
			logidx = 3;
		}
		var data = room.getLog(logidx).join("\n");
		var datahash = crypto.createHash('md5').update(data.replace(/[^(\x20-\x7F)]+/g, '')).digest('hex');

		LoginServer.request('prepreplay', {
			id: room.id.substr(7),
			loghash: datahash,
			p1: room.p1.name,
			p2: room.p2.name,
			format: room.format
		}, function (success) {
			if (success && success.errorip) {
				connection.popup("This server's request IP " + success.errorip + " is not a registered server.");
				return;
			}
			connection.send('|queryresponse|savereplay|' + JSON.stringify({
				log: data,
				id: room.id.substr(7)
			}));
		});
	},

	mv: 'move',
	attack: 'move',
	move: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', 'move ' + target);
	},

	sw: 'switch',
	switch: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', 'switch ' + parseInt(target, 10));
	},

	choose: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', target);
	},

	undo: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'undo', target);
	},

	team: function (target, room, user) {
		if (!room.decision) return this.sendReply("You can only do this in battle rooms.");

		room.decision(user, 'choose', 'team ' + target);
	},

	joinbattle: function (target, room, user) {
		if (!room.joinBattle) return this.sendReply("You can only do this in battle rooms.");
		if (!user.can('joinbattle', room)) {
			var requiredGroupId = Config.groups.bySymbol[Users.getGroupsThatCan('joinbattle', room)[0]].id;
			return this.popupReply("You must be a room" + requiredGroupId + " to join a battle you didn't start. Ask a player to use /room" + requiredGroupId + " on you to join this battle.");
		}

		room.joinBattle(user);
	},

	partbattle: 'leavebattle',
	leavebattle: function (target, room, user) {
		if (!room.leaveBattle) return this.sendReply("You can only do this in battle rooms.");

		room.leaveBattle(user);
	},

	kickbattle: function (target, room, user) {
		if (!room.leaveBattle) return this.sendReply("You can only do this in battle rooms.");

		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser || !targetUser.connected) {
			return this.sendReply("User " + this.targetUsername + " not found.");
		}
		if (!this.can('kick', targetUser)) return false;

		if (room.leaveBattle(targetUser)) {
			this.addModCommand("" + targetUser.name + " was kicked from a battle by " + user.name + (target ? " (" + target + ")" : ""));
		} else {
			this.sendReply("/kickbattle - User isn't in battle.");
		}
	},

	kickinactive: function (target, room, user) {
		if (room.requestKickInactive) {
			room.requestKickInactive(user);
		} else {
			this.sendReply("You can only kick inactive players from inside a room.");
		}
	},

	timer: function (target, room, user) {
		target = toId(target);
		if (room.requestKickInactive) {
			if (target === 'off' || target === 'false' || target === 'stop') {
				room.stopKickInactive(user, user.can('timer'));
			} else if (target === 'on' || target === 'true' || !target) {
				room.requestKickInactive(user, user.can('timer'));
			} else {
				this.sendReply("'" + target + "' is not a recognized timer state.");
			}
		} else {
			this.sendReply("You can only set the timer from inside a room.");
		}
	},

	autotimer: 'forcetimer',
	forcetimer: function (target, room, user) {
		target = toId(target);
		if (!this.can('autotimer')) return;
		if (target === 'off' || target === 'false' || target === 'stop') {
			Config.forceTimer = false;
			this.addModCommand("Forcetimer is now OFF: The timer is now opt-in. (set by " + user.name + ")");
		} else if (target === 'on' || target === 'true' || !target) {
			Config.forceTimer = true;
			this.addModCommand("Forcetimer is now ON: All battles will be timed. (set by " + user.name + ")");
		} else {
			this.sendReply("'" + target + "' is not a recognized forcetimer setting.");
		}
	},

	forcetie: 'forcewin',
	forcewin: function (target, room, user) {
		if (!this.can('forcewin')) return false;
		if (!room.battle) {
			this.sendReply("/forcewin - This is not a battle room.");
			return false;
		}

		room.battle.endType = 'forced';
		if (!target) {
			room.battle.tie();
			this.logModCommand(user.name + " forced a tie.");
			return false;
		}
		target = Users.get(target);
		if (target) target = target.userid;
		else target = '';

		if (target) {
			room.battle.win(target);
			this.logModCommand(user.name + " forced a win for " + target + ".");
		}
	},

	/*********************************************************
	 * Challenging and searching commands
	 *********************************************************/

	cancelsearch: 'search',
	search: function (target, room, user) {
		if (target) {
			if (Config.modchat.pm) {
				var userGroup = user.group;
				if (Config.groups.bySymbol[userGroup].rank < Config.groups.bySymbol[Config.modchat.pm].rank) {
					var groupName = Config.groups.bySymbol[Config.modchat.pm].name || Config.modchat.pm;
					this.popupReply("Because moderated chat is set, you must be of rank " + groupName + " or higher to search for a battle.");
					return false;
				}
			}
			Rooms.global.searchBattle(user, target);
		} else {
			Rooms.global.cancelSearch(user);
		}
	},

	chall: 'challenge',
	challenge: function (target, room, user, connection) {
		target = this.splitTarget(target);
		var targetUser = this.targetUser;
		if (!targetUser || !targetUser.connected) {
			return this.popupReply("The user '" + this.targetUsername + "' was not found.");
		}
		if (targetUser.blockChallenges && !user.can('bypassblocks', targetUser)) {
			return this.popupReply("The user '" + this.targetUsername + "' is not accepting challenges right now.");
		}
		if (Config.modchat.pm) {
			var userGroup = user.group;
			if (Config.groups.bySymbol[userGroup].rank < Config.groups.bySymbol[Config.modchat.pm].rank) {
				var groupName = Config.groups.bySymbol[Config.modchat.pm].name || Config.modchat.pm;
				this.popupReply("Because moderated chat is set, you must be of rank " + groupName + " or higher to challenge users.");
				return false;
			}
		}
		user.prepBattle(target, 'challenge', connection, function (result) {
			if (result) user.makeChallenge(targetUser, target);
		});
	},

	away: 'blockchallenges',
	idle: 'blockchallenges',
	blockchallenges: function (target, room, user) {
		if (user.blockChallenges) return this.sendReply("You are already blocking challenges!");
		user.blockChallenges = true;
		this.sendReply("You are now blocking all incoming challenge requests.");
	},

	back: 'allowchallenges',
	allowchallenges: function (target, room, user) {
		if (!user.blockChallenges) return this.sendReply("You are already available for challenges!");
		user.blockChallenges = false;
		this.sendReply("You are available for challenges from now on.");
	},

	cchall: 'cancelChallenge',
	cancelchallenge: function (target, room, user) {
		user.cancelChallengeTo(target);
	},

	accept: function (target, room, user, connection) {
		var userid = toId(target);
		var format = '';
		if (user.challengesFrom[userid]) format = user.challengesFrom[userid].format;
		if (!format) {
			this.popupReply(target + " cancelled their challenge before you could accept it.");
			return false;
		}
		user.prepBattle(format, 'challenge', connection, function (result) {
			if (result) user.acceptChallengeFrom(userid);
		});
	},

	reject: function (target, room, user) {
		user.rejectChallengeFrom(toId(target));
	},

	saveteam: 'useteam',
	utm: 'useteam',
	useteam: function (target, room, user) {
		user.team = target;
	},

	/*********************************************************
	 * Low-level
	 *********************************************************/

	cmd: 'query',
	query: function (target, room, user, connection) {
		// Avoid guest users to use the cmd errors to ease the app-layer attacks in emergency mode
		var trustable = (!Config.emergency || (user.named && user.authenticated));
		if (Config.emergency && ResourceMonitor.countCmd(connection.ip, user.name)) return false;
		var spaceIndex = target.indexOf(' ');
		var cmd = target;
		if (spaceIndex > 0) {
			cmd = target.substr(0, spaceIndex);
			target = target.substr(spaceIndex + 1);
		} else {
			target = '';
		}
		if (cmd === 'userdetails') {
			var targetUser = Users.get(target);
			if (!trustable || !targetUser) {
				connection.send('|queryresponse|userdetails|' + JSON.stringify({
					userid: toId(target),
					rooms: false
				}));
				return false;
			}
			var roomList = {};
			for (var i in targetUser.roomCount) {
				if (i === 'global') continue;
				var targetRoom = Rooms.get(i);
				if (!targetRoom || targetRoom.isPrivate) continue;
				var roomData = {};
				if (targetRoom.battle) {
					var battle = targetRoom.battle;
					roomData.p1 = battle.p1 ? ' ' + battle.p1 : '';
					roomData.p2 = battle.p2 ? ' ' + battle.p2 : '';
				}
				roomList[i] = roomData;
			}
			if (!targetUser.roomCount['global']) roomList = false;
			var userdetails = {
				userid: targetUser.userid,
				avatar: targetUser.avatar,
				rooms: roomList
			};
			if (user.can('ip', targetUser)) {
				var ips = Object.keys(targetUser.ips);
				if (ips.length === 1) {
					userdetails.ip = ips[0];
				} else {
					userdetails.ips = ips;
				}
			}
			connection.send('|queryresponse|userdetails|' + JSON.stringify(userdetails));
		} else if (cmd === 'roomlist') {
			if (!trustable) return false;
			connection.send('|queryresponse|roomlist|' + JSON.stringify({
				rooms: Rooms.global.getRoomList(target)
			}));
		} else if (cmd === 'rooms') {
			if (!trustable) return false;
			connection.send('|queryresponse|rooms|' + JSON.stringify(
				Rooms.global.getRooms()
			));
		}
	},

	trn: function (target, room, user, connection) {
		var commaIndex = target.indexOf(',');
		var targetName = target;
		var targetAuth = false;
		var targetToken = '';
		if (commaIndex >= 0) {
			targetName = target.substr(0, commaIndex);
			target = target.substr(commaIndex + 1);
			commaIndex = target.indexOf(',');
			targetAuth = target;
			if (commaIndex >= 0) {
				targetAuth = !!parseInt(target.substr(0, commaIndex), 10);
				targetToken = target.substr(commaIndex + 1);
			}
		}
		user.rename(targetName, targetToken, targetAuth, connection);
	}

};
