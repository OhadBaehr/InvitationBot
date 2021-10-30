import { Client, Message, Intents, ActivitiesOptions, PresenceData, Invite, GuildMember, Role } from 'discord.js'
import { Logger } from '../utils/Logger'
import { delay, removeFirstWord } from '../utils'
import { BotConfig } from '../services/BotConfig.service'
import InvitationsService from '../services/Invitations.service'
import { Invitation } from '../models/Invitation.model'

enum BotCommands {
    HELP = 'help',
    HELP_SHORT = 'h',
    LEADERBOARD = 'leaderboard',
    LEADERBOARD_SHORT = 'lb'
}

enum BotEvents {
    ERROR = 'error',
    READY = 'ready',
    MESSAGE = 'message',
    INVITE_CREATE = 'inviteCreate',
    MEBMER_ADD = 'guildMemberAdd',
    MEMBER_UPDATED = 'guildMemberUpdate'
}

export default class BotController {
    private static _maxReconnectAttempt = 5
    private static _instance: BotController | null = null
    public static get instance() {
        if (!this._instance) {
            this._instance = new BotController()
        }

        return this._instance
    }

    public static get hasInstance() {
        return this._instance ? true : false
    }

    public static initInstance() {
        if (this.hasInstance) {
            this._instance!._removeListeners()
            this._instance!._bot.destroy()
            this._instance = null
        }

        this._instance = new BotController()
    }

    private _bot: Client
    private _db: InvitationsService
    private _handlers: { [key: string]: (...args: any[]) => void }
    private _reconnectAttemptsCount: number
    private _logger: Logger
    public config: BotConfig

    constructor() {
        this._logger = new Logger('BotController')
        this._reconnectAttemptsCount = 0
        this.config = BotConfig.instance

        const intents = [
            Intents.FLAGS.GUILDS,
            Intents.FLAGS.GUILD_MESSAGES,
            Intents.FLAGS.GUILD_INVITES,
            Intents.FLAGS.GUILD_MEMBERS
        ]
        this._bot = new Client({ intents })

        this._handlers = {
            [BotEvents.ERROR]: this._error.bind(this),
            [BotEvents.READY]: this._ready.bind(this),
            [BotEvents.MESSAGE]: this._message.bind(this),
            [BotEvents.INVITE_CREATE]: this._invitationCreated.bind(this),
            [BotEvents.MEBMER_ADD]: this._newMember.bind(this),
            [BotEvents.MEMBER_UPDATED]: this._memberUpdated.bind(this)
        }

        this._db = new InvitationsService()

        this._addListeners()
        this._connect()
    }

    private _addListeners() {
        Object.entries(this._handlers).forEach(([key, value]) => this._bot.on(key, value))
    }

    private _removeListeners() {
        Object.entries(this._handlers).forEach(([key, value]) => this._bot.off(key, value))
    }

    private _error(e: any) {
        this._logger.warn('Error occured in the bot client')
        this._logger.error(e)
    }

    private _ready() {
        this._logger.log('The bot is connected !', `The Prefix: ${this.config.prefix}`)
        this._cacheInvites()
    }

    private async _cacheInvites() {
        try {
            await delay(1000)
            await this._db.awaitCreation()

            this._bot.guilds.cache.each(async (g) => {
                const invites = await g.invites.fetch()
                invites.each(async (i: Invite) => {
                    const invite = await this._db.get(i.code)
                    if (!invite) {
                        await this._db.add(
                            new Invitation({
                                code: i.code,
                                inviter: i.inviter?.id ?? 'none',
                                uses: i.uses ?? 0,
                                count: 0
                            })
                        )
                    } else {
                        await this._db.update(i.code, { uses: i.uses ?? invite.uses ?? 0 })
                    }
                })
            })

            await delay(5000)
            this._logger.log('Invitations Cached!')
        } catch (e: any) {
            this._logger.warn('Error occured in invitation created')
            this._logger.error('Error Occured', e)
        }
    }

    private async _helpCommand(message: Message) {
        const embedded = {
            color: 0xffff00,
            title: 'Invitation Bot',
            description: `Prefix: '**${this.config.prefix}**'`,
            fields: [
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: 'LeaderBoard',
                    value: `The leaderboard can be reached by:\n${this.config.prefix}leaderboard`,
                    inline: true
                }
            ]
        }

        try {
            await message.reply({ embeds: [embedded] })
        } catch (e: any) {
            this._logger.warn('Error in help command')
            this._logger.error(e)
        }
    }

    private async _leaderBoard(message: Message) {
        const embedded = {
            color: 0xffff00,
            title: 'Invitations LeaderBoard',
            description: `showing top 10 inviters`,
            fields: [
                {
                    name: `Index\tName\tCount`,
                    value: `----------------`,
                    inline: false
                }
            ]
        }

        const results = await this._db.leaderboard()
        let index = 0
        if (results.length) {
            for (const r of results) {
                const members = await message.guild?.members.fetch()
                const member = members?.find((m) => m.user.id === r.inviter)
                if (!member) {
                    continue
                }

                embedded.fields.push({
                    name: `${index + 1}\t${member.nickname ?? member.displayName}\t${r.entries}`,
                    value: `----------------`,
                    inline: false
                })
                index++
            }
        } else {
            embedded.fields = []
            embedded.description = 'Empty Leaderboard'
        }

        try {
            await message.reply({ embeds: [embedded] })
        } catch (e: any) {
            this._logger.warn('Error in help command')
            this._logger.error(e)
        }
    }

    private _handleCommands(message: Message) {
        const content = message.content.substring(1)
        const { first, rest } = removeFirstWord(content)
        switch (first?.toLowerCase()) {
            case BotCommands.LEADERBOARD:
            case BotCommands.LEADERBOARD_SHORT:
                this._leaderBoard(message)
                break
            case BotCommands.HELP:
            case BotCommands.HELP_SHORT:
                this._helpCommand(message)
                break
            default:
                // return message of service not available.
                break
        }
    }

    private _message(message: Message) {
        if (message.content.startsWith(this.config.prefix)) {
            this._handleCommands(message)
            return
        }
    }

    private async _connect() {
        try {
            await this._bot.login(process.env.BOT_TOKEN)
            await this.setPresence()
            await this._db.awaitCreation()
        } catch (e) {
            if (this._reconnectAttemptsCount < BotController._maxReconnectAttempt) {
                this._logger.log(`Attempting Reconnect #${this._reconnectAttemptsCount++ + 1}`)
                await delay(500)
                this._connect()
            } else {
                this._logger.warn('Max Reconnect Attempts Reached!')
                this._logger.error('Error Occured', e)
            }
        }
    }

    private async setPresence(activities: ActivitiesOptions[] = []) {
        let presenceMessage = process.env.$npm_package_version ?? process.env.npm_package_version
        presenceMessage = presenceMessage ? `v${presenceMessage}` : 'You :)'

        try {
            const presenceConfig: PresenceData = {
                status: 'online',
                activities: [
                    {
                        name: presenceMessage,
                        type: presenceMessage ? 'STREAMING' : 'WATCHING'
                    },
                    ...activities
                ]
            }
            await this._bot.user?.setPresence(presenceConfig)
        } catch (e) {
            this._logger.warn('Error Setting Presence')
            this._logger.error('Error Occured', e)
        }
    }

    private async _invitationCreated(invite: Invite) {
        try {
            const invitation = new Invitation({
                code: invite.code,
                inviter: invite.inviter?.id ?? 'none'
            })

            await this._db.add(invitation)
        } catch (e: any) {
            this._logger.warn('Error occured in invitation created')
            this._logger.error('Error Occured', e)
        }
    }

    private async _newMember(member: GuildMember) {
        try {
            const invites = await member.guild.invites.fetch()
            await Promise.all(
                invites.each(async (invite) => {
                    let dbInvite = await this._db.get(invite.code)
                    if (!dbInvite) {
                        dbInvite = new Invitation({
                            code: invite.code,
                            inviter: invite.inviter?.id ?? 'none',
                            uses: invite.uses ?? 0
                        })
                        this._db.add(dbInvite)
                    }

                    if (invite.uses && invite.uses !== dbInvite.uses) {
                        await this._db.update(dbInvite.code, { uses: invite.uses })

                        const roleName = `pending-${invite.code}`
                        const roles = await member.guild.roles.fetch()
                        let role = roles.find((r) => r.name === roleName)
                        if (!role) {
                            role = await member.guild.roles.create({
                                name: roleName
                            })
                        }
                        await member.roles.add(role.id)
                        this._logger.log(`User ${member.user.username} was invited by ${invite.inviter?.username}`)
                    }
                })
            )
        } catch (e: any) {
            this._logger.warn('Error occured in invitation created')
            this._logger.error('Error Occured', e)
        }
    }

    private async _memberUpdated(oldMember: GuildMember, newMember: GuildMember) {
        if (oldMember.roles.cache.size >= newMember.roles.cache.size) {
            return
        }

        let isApproved = false
        let inviteCode = 'none'
        let inviteRoleId: string | undefined = undefined

        // check if the member has special invite role pending
        newMember.roles.cache.each((r) => {
            if (r.name.startsWith('pending')) {
                if (inviteRoleId) {
                    throw new Error('Use has multiple invited by roles!!!')
                }
                inviteCode = r.name.split('-')[1]
                inviteRoleId = r.id
            }
        })

        // if the member has special pending inviter role
        if (inviteRoleId) {
            // check if the diff between the changes was one of the special roles
            newMember.roles.cache.difference(oldMember.roles.cache).each((r) => {
                if (this.config.specialRoles.includes(r.name)) {
                    isApproved = true
                }
            })
        }

        if (!isApproved) {
            return
        }

        try {
            let invite = await this._db.get(inviteCode)
            if (!invite) {
                const invites = await newMember.guild.invites.fetch()
                const guildInvite = invites.find((i) => i.code === inviteCode)
                if (!guildInvite) {
                    return
                }

                invite = new Invitation({
                    code: guildInvite.code,
                    inviter: guildInvite.inviter?.id ?? 'none',
                    uses: 1,
                    count: 1
                })
                await this._db.add(invite)
            } else {
                await this._db.update(invite.code, { count: invite.count + 1 })
            }

            if (inviteRoleId) {
                await newMember.roles.remove(inviteRoleId)
            }
        } catch (e: any) {
            this._logger.warn('Error occured in invitation created')
            this._logger.error('Error Occured', e)
        }
    }
}
