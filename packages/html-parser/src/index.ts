import type {
    IMessageEntityParser,
    MessageEntity,
    FormattedString,
} from '@mtcute/client'
import { tl } from '@mtcute/tl'
import { Parser } from 'htmlparser2'
import bigInt from 'big-integer'

const MENTION_REGEX = /^tg:\/\/user\?id=(\d+)(?:&hash=(-?[0-9a-fA-F]+)(?:&|$)|&|$)/

/**
 * Tagged template based helper for escaping entities in HTML
 *
 * @example
 * ```typescript
 * const escaped = html`<b>${user.displayName}</b>`
 * ```
 */
export function html(
    strings: TemplateStringsArray,
    ...sub: (string | FormattedString)[]
): FormattedString {
    let str = ''
    sub.forEach((it, idx) => {
        if (typeof it === 'string') it = HtmlMessageEntityParser.escape(it)
        else {
            if (it.mode && it.mode !== 'html')
                throw new Error(`Incompatible parse mode: ${it.mode}`)
            it = it.value
        }

        str += strings[idx] + it
    })
    return { value: str + strings[strings.length - 1], mode: 'html' }
}

/**
 * Alias for {@link html} for Prettier users.
 *
 * Prettier formats <code>html`...`</code> as normal HTML,
 * thus may add unwanted line breaks.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export declare function htm(
    strings: TemplateStringsArray,
    ...sub: (string | FormattedString)[]
): FormattedString

/** @internal */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const htm = html

// ts ignores above are a hack so the resulting d.ts contains `htm`
// as a function and not a variable, thus the ide would highlight
// it as such (the same way as `html`)

export namespace HtmlMessageEntityParser {
    /**
     * Syntax highlighter function used in {@link HtmlMessageEntityParser.unparse}
     *
     * Must be sync (this might change in the future) and must return valid HTML.
     */
    export type SyntaxHighlighter = (code: string, language: string) => string

    export interface Options {
        syntaxHighlighter?: SyntaxHighlighter
    }
}

/**
 * HTML MessageEntity parser.
 *
 * This class implements syntax very similar to one available
 * in the Bot API ([documented here](https://core.telegram.org/bots/api#html-style))
 * with some slight differences.
 */
export class HtmlMessageEntityParser implements IMessageEntityParser {
    name = 'html'

    private readonly _syntaxHighlighter?: HtmlMessageEntityParser.SyntaxHighlighter

    constructor(options?: HtmlMessageEntityParser.Options) {
        this._syntaxHighlighter = options?.syntaxHighlighter
    }

    /**
     * Escape the string so it can be safely used inside HTML
     *
     * @param str  String to be escaped
     * @param quote  Whether `"` (double quote) should be escaped as `&quot;`
     */
    static escape(str: string, quote = false): string {
        str = str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
        if (quote) str = str.replace(/"/g, '&quot;')

        return str
    }

    parse(text: string): [string, tl.TypeMessageEntity[]] {
        const stacks: Record<string, tl.Mutable<tl.TypeMessageEntity>[]> = {}
        const entities: tl.TypeMessageEntity[] = []
        let plainText = ''

        const parser = new Parser({
            onopentag(name, attribs) {
                name = name.toLowerCase()

                let entity: tl.TypeMessageEntity
                switch (name) {
                    case 'b':
                    case 'strong':
                        entity = {
                            _: 'messageEntityBold',
                            offset: plainText.length,
                            length: 0,
                        }
                        break
                    case 'i':
                    case 'em':
                        entity = {
                            _: 'messageEntityItalic',
                            offset: plainText.length,
                            length: 0,
                        }
                        break
                    case 'u':
                        entity = {
                            _: 'messageEntityUnderline',
                            offset: plainText.length,
                            length: 0,
                        }
                        break
                    case 's':
                    case 'del':
                    case 'strike':
                        entity = {
                            _: 'messageEntityStrike',
                            offset: plainText.length,
                            length: 0,
                        }
                        break
                    case 'blockquote':
                        entity = {
                            _: 'messageEntityBlockquote',
                            offset: plainText.length,
                            length: 0,
                        }
                        break
                    case 'code':
                        entity = {
                            _: 'messageEntityCode',
                            offset: plainText.length,
                            length: 0,
                        }
                        break
                    case 'pre':
                        entity = {
                            _: 'messageEntityPre',
                            offset: plainText.length,
                            length: 0,
                            language: attribs.language ?? '',
                        }
                        break
                    case 'a': {
                        let url = attribs.href
                        if (!url) return

                        const mention = MENTION_REGEX.exec(url)
                        if (mention) {
                            const accessHash = mention[2]
                            if (accessHash) {
                                entity = {
                                    _: 'inputMessageEntityMentionName',
                                    offset: plainText.length,
                                    length: 0,
                                    userId: {
                                        _: 'inputUser',
                                        userId: parseInt(mention[1]),
                                        accessHash: bigInt(accessHash, 16),
                                    },
                                }
                            } else {
                                entity = {
                                    _: 'messageEntityMentionName',
                                    offset: plainText.length,
                                    length: 0,
                                    userId: parseInt(mention[1]),
                                }
                            }
                        } else {
                            if (url.match(/^\/\//)) url = 'http:' + url

                            entity = {
                                _: 'messageEntityTextUrl',
                                offset: plainText.length,
                                length: 0,
                                url,
                            }
                        }
                        break
                    }
                    default:
                        return
                }

                if (!(name in stacks)) {
                    stacks[name] = []
                }
                stacks[name].push(entity)
            },
            ontext(data) {
                for (const ents of Object.values(stacks)) {
                    for (const ent of ents) {
                        ent.length += data.length
                    }
                }

                plainText += data
            },
            onclosetag(name: string) {
                const entity = stacks[name]?.pop()
                if (!entity) return // unmatched close tag
                entities.push(entity)
            },
        })

        parser.write(text)

        return [plainText, entities]
    }

    unparse(text: string, entities: ReadonlyArray<MessageEntity>): string {
        return this._unparse(text, entities)
    }

    // internal function that uses recursion to correctly process nested & overlapping entities
    private _unparse(
        text: string,
        entities: ReadonlyArray<MessageEntity>,
        entitiesOffset = 0,
        offset = 0,
        length = text.length
    ): string {
        if (!text) return text
        if (!entities.length || entities.length === entitiesOffset) {
            return HtmlMessageEntityParser.escape(text)
        }

        const end = offset + length

        const html: string[] = []
        let lastOffset = 0

        for (let i = entitiesOffset; i < entities.length; i++) {
            const entity = entities[i]
            if (entity.offset >= end) break

            let entOffset = entity.offset
            let length = entity.length
            if (entOffset < 0) {
                length += entOffset
                entOffset = 0
            }

            let relativeOffset = entOffset - offset
            if (relativeOffset > lastOffset) {
                // add missing plain text
                html.push(
                    HtmlMessageEntityParser.escape(
                        text.substring(lastOffset, relativeOffset)
                    )
                )
            } else if (relativeOffset < lastOffset) {
                length -= lastOffset - relativeOffset
                relativeOffset = lastOffset
            }

            if (length <= 0 || relativeOffset >= end || relativeOffset < 0)
                continue

            let skip = false

            const substr = text.substr(relativeOffset, length)
            if (!substr) continue

            const entityText = this._unparse(
                substr,
                entities,
                i + 1,
                offset + relativeOffset,
                length
            )

            const type = entity.type
            switch (type) {
                case 'bold':
                case 'italic':
                case 'underline':
                case 'strikethrough':
                    html.push(`<${type[0]}>${entityText}</${type[0]}>`)
                    break
                case 'code':
                case 'pre':
                case 'blockquote':
                    html.push(
                        `<${type}${
                            type === 'pre' && entity.language
                                ? ` language="${entity.language}"`
                                : ''
                        }>${
                            this._syntaxHighlighter
                                ? this._syntaxHighlighter(
                                      entityText,
                                      entity.language!
                                  )
                                : entityText
                        }</${type}>`
                    )
                    break
                case 'email':
                    html.push(
                        `<a href="mailto:${entityText}">${entityText}</a>`
                    )
                    break
                case 'url':
                    html.push(`<a href="${entityText}">${entityText}</a>`)
                    break
                case 'text_link':
                    html.push(
                        `<a href="${HtmlMessageEntityParser.escape(
                            entity.url!,
                            true
                        )}">${entityText}</a>`
                    )
                    break
                case 'text_mention':
                    html.push(
                        `<a href="tg://user?id=${entity.userId!}">${entityText}</a>`
                    )
                    break
                default:
                    skip = true
                    break
            }

            lastOffset = relativeOffset + (skip ? 0 : length)
        }

        html.push(HtmlMessageEntityParser.escape(text.substr(lastOffset)))

        return html.join('')
    }
}
