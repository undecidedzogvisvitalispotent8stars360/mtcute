/**
 * A phone contact
 */
import { tl } from '@mtcute/tl'
import { makeInspectable } from '../utils'

export class Contact {
    readonly type = 'contact' as const

    readonly obj: tl.RawMessageMediaContact

    constructor(obj: tl.RawMessageMediaContact) {
        this.obj = obj
    }

    /**
     * Contact's phone number
     */
    get phoneNumber(): string {
        return this.obj.phoneNumber
    }

    /**
     * Contact's first name
     */
    get firstName(): string {
        return this.obj.firstName
    }

    /**
     * Contact's last name
     */
    get lastName(): string {
        return this.obj.lastName
    }

    /**
     * Contact's user ID in Telegram or `0` if not available
     */
    get userId(): number {
        return this.obj.userId
    }

    /**
     * Input media TL object generated from this object,
     * to be used inside {@link InputMediaLike} and
     * {@link TelegramClient.sendMedia}
     */
    get inputMedia(): tl.TypeInputMedia {
        return {
            ...this.obj,
            _: 'inputMediaContact',
        }
    }
}

makeInspectable(Contact, undefined, ['inputMedia'])
