export enum LogLevels {
    DEBUG = 'DEBUG',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export const LogPriority: { [key: string]: number } = {
    [LogLevels.DEBUG]: 100,
    [LogLevels.WARN]: 200,
    [LogLevels.ERROR]: 300
}


export interface BotConfig {
    logLevel: LogLevels
    prefix: string
    specialRoles: string[]
}