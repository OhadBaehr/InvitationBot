export interface Invitation {
    code: string
    inviter: string
    uses: number
    count: number
}

export class Invitation implements Invitation {
    constructor(_invitation: Partial<Invitation> & Pick<Invitation, 'code' | 'inviter'>) {
        this.code = _invitation.code
        this.inviter = _invitation.inviter
        this.uses = _invitation.uses ?? 0
        this.count = _invitation.count ?? 0
    }
}
