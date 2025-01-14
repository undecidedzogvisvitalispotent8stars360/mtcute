import { MaybeDynamic, MtArgumentError, User } from '../../types'
import { TelegramClient } from '../../client'

/**
 * Utility function to quickly authorize on test DC
 * using a [Test phone number](https://core.telegram.org/api/auth#test-phone-numbers),
 * which is randomly generated by default.
 *
 * > **Note**: Using this method assumes that you
 * > are using a test DC in `primaryDc` parameter.
 *
 * @param params  Additional parameters
 * @internal
 */
export async function startTest(
    this: TelegramClient,
    params?: {
        /**
         * Whether to log out if current session is logged in.
         *
         * Defaults to false.
         */
        logout?: boolean

        /**
         * Override phone number. Must be a valid Test phone number.
         *
         * By default is randomly generated.
         */
        phone?: string

        /**
         * Override user's DC. Must be a valid test DC.
         */
        dcId?: number

        /**
         * First name of the user (used only for sign-up, defaults to 'User')
         */
        firstName?: MaybeDynamic<string>

        /**
         * Last name of the user (used only for sign-up, defaults to empty)
         */
        lastName?: MaybeDynamic<string>

        /**
         * By using this method to sign up an account, you are agreeing to Telegram
         * ToS. This is required and your account will be banned otherwise.
         * See https://telegram.org/tos and https://core.telegram.org/api/terms.
         *
         * If true, TOS will not be displayed and `tosCallback` will not be called.
         */
        acceptTos?: boolean
    }
): Promise<User> {
    if (!params) params = {}

    if (params.logout)
        try {
            await this.logOut()
        } catch (e) {}

    const availableDcs = await this.call({
        _: 'help.getConfig',
    }).then((res) => res.dcOptions)

    let phone = params.phone
    if (phone) {
        if (!phone.match(/^99966\d{5}/))
            throw new MtArgumentError(
                `${phone} is an invalid test phone number`
            )
        const id = parseInt(phone[5])
        if (!availableDcs.find((dc) => dc.id === id))
            throw new MtArgumentError(`${phone} has invalid DC ID (${id})`)
    } else {
        let dcId = this._primaryDc.id
        if (params.dcId) {
            if (!availableDcs.find((dc) => dc.id === params!.dcId))
                throw new MtArgumentError(`DC ID is invalid (${dcId})`)
            dcId = params.dcId
        }

        let numbers = Math.floor(Math.random() * 9999).toString()
        while (numbers.length !== 4) numbers += '0'

        phone = `99966${dcId}${numbers}`
    }

    let code = ''

    return this.start({
        phone,
        code: () => code,
        firstName: params.firstName,
        lastName: params.lastName,
        acceptTos: params.acceptTos,
        codeSentCallback: (sent) => {
            for (let i = 0; i < sent.length; i++) {
                code += phone![5]
            }
        },
    })
}
