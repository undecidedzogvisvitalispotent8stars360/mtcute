import { TelegramClient } from '../../client'
import { tl } from '@mtcute/tl'
import { BotInline, InputInlineResult } from '../../types'

/**
 * Answer an inline query.
 *
 * @param queryId  Inline query ID
 * @param results  Results of the query
 * @param params  Additional parameters
 * @internal
 */
export async function answerInlineQuery(
    this: TelegramClient,
    queryId: tl.Long,
    results: InputInlineResult[],
    params?: {
        /**
         * Maximum number of time in seconds that the results of the
         * query may be cached on the server for.
         *
         * Defaults to `300`
         */
        cacheTime?: number

        /**
         * Whether the results should be displayed as a gallery instead
         * of a vertical list. Only applicable to some media types.
         *
         * Defaults to `true`
         */
        gallery?: boolean

        /**
         * Whether the results should only be cached on the server
         * for the user who sent the query.
         *
         * Defaults to `false`
         */
        private?: boolean

        /**
         * Next pagination offset (up to 64 bytes).
         *
         * When user has reached the end of the current results,
         * it will re-send the inline query with the same text, but
         * with `offset` set to this value.
         *
         * If omitted or empty string is provided, it is assumed that
         * there are no more results.
         */
        nextOffset?: string

        /**
         * If passed, clients will display a button before any other results,
         * that when clicked switches the user to a private chat with the bot
         * and sends the bot `/start ${parameter}`.
         *
         * An example from the Bot API docs:
         *
         * An inline bot that sends YouTube videos can ask the user to connect
         * the bot to their YouTube account to adapt search results accordingly.
         * To do this, it displays a "Connect your YouTube account" button above
         * the results, or even before showing any. The user presses the button,
         * switches to a private chat with the bot and, in doing so, passes a start
         * parameter that instructs the bot to return an oauth link. Once done, the
         * bot can offer a switch_inline button so that the user can easily return to
         * the chat where they wanted to use the bot's inline capabilities
         */
        switchPm?: {
            /**
             * Text of the button
             */
            text: string

            /**
             * Parameter for `/start` command
             */
            parameter: string
        }

        /**
         * Parse mode to use when parsing inline message text.
         * Defaults to current default parse mode (if any).
         *
         * Passing `null` will explicitly disable formatting.
         *
         * **Note**: inline results themselves *can not* have markup
         * entities, only the messages that are sent once a result is clicked.
         */
        parseMode?: string | null
    }
): Promise<void> {
    if (!params) params = {}

    const tlResults = await Promise.all(
        results.map((it) => BotInline._convertToTl(this, it, params!.parseMode))
    )

    await this.call({
        _: 'messages.setInlineBotResults',
        queryId,
        results: tlResults,
        cacheTime: params.cacheTime ?? 300,
        gallery: params.gallery ?? true,
        private: params.private,
        nextOffset: params.nextOffset,
        switchPm: params.switchPm
            ? {
                  _: 'inlineBotSwitchPM',
                  text: params.switchPm.text,
                  startParam: params.switchPm.parameter,
              }
            : undefined,
    })
}
