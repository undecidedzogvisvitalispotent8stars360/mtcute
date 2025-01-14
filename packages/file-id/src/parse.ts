import { telegramRleDecode } from './utils'
import { tdFileId as td } from './types'
import { BinaryReader, parseUrlSafeBase64 } from '@mtcute/core'

function parseWebFileLocation(
    reader: BinaryReader
): td.RawWebRemoteFileLocation {
    return {
        _: 'web',
        url: reader.string(),
        accessHash: reader.long(),
    }
}

function parsePhotoSizeSource(reader: BinaryReader): td.TypePhotoSizeSource {
    const variant = reader.int32()
    switch (variant) {
        case 0 /* LEGACY */:
            return {
                _: 'legacy',
                secret: reader.long(),
            }
        case 1 /* THUMBNAIL */: {
            const fileType = reader.int32()
            if (fileType < 0 || fileType >= td.FileType.Size)
                throw new td.UnsupportedError(
                    `Unsupported file type: ${fileType} (${reader.data.toString(
                        'base64'
                    )})`
                )

            const thumbnailType = reader.int32()
            if (thumbnailType < 0 || thumbnailType > 255) {
                throw new td.InvalidFileIdError(
                    `Wrong thumbnail type: ${thumbnailType} (${reader.data.toString(
                        'base64'
                    )})`
                )
            }

            return {
                _: 'thumbnail',
                fileType,
                thumbnailType: String.fromCharCode(thumbnailType),
            }
        }
        case 2 /* DIALOG_PHOTO_SMALL */:
        case 3 /* DIALOG_PHOTO_BIG */:
            return {
                _: 'dialogPhoto',
                big: variant === 3,
                id: reader.long(),
                accessHash: reader.long(),
            }
        case 4 /* STICKERSET_THUMBNAIL */:
            return {
                _: 'stickerSetThumbnail',
                id: reader.long(),
                accessHash: reader.long(),
            }
        case 5 /* FULL_LEGACY */: {
            const res: td.RawPhotoSizeSourceFullLegacy = {
                _: 'fullLegacy',
                volumeId: reader.long(),
                secret: reader.long(),
                localId: reader.int32()
            }

            if (res.localId < 0) {
                throw new td.InvalidFileIdError('Wrong local_id (< 0)')
            }

            return res
        }
        case 6 /* DIALOG_PHOTO_SMALL_LEGACY */:
        case 7 /* DIALOG_PHOTO_BIG_LEGACY */: {
            const res: td.RawPhotoSizeSourceDialogPhotoLegacy = {
                _: 'dialogPhotoLegacy',
                big: variant === 7,
                id: reader.long(),
                accessHash: reader.long(),
                volumeId: reader.long(),
                localId: reader.int32()
            }

            if (res.localId < 0) {
                throw new td.InvalidFileIdError('Wrong local_id (< 0)')
            }

            return res
        }
        case 8 /* STICKERSET_THUMBNAIL_LEGACY */: {
            const res: td.RawPhotoSizeSourceStickerSetThumbnailLegacy = {
                _: 'stickerSetThumbnailLegacy',
                id: reader.long(),
                accessHash: reader.long(),
                volumeId: reader.long(),
                localId: reader.int32()
            }

            if (res.localId < 0) {
                throw new td.InvalidFileIdError('Wrong local_id (< 0)')
            }

            return res
        }
        case 9 /* STICKERSET_THUMBNAIL_VERSION */:
            return {
                _: 'stickerSetThumbnailVersion',
                id: reader.long(),
                accessHash: reader.long(),
                version: reader.int32()
            }
        default:
            throw new td.UnsupportedError(
                `Unsupported photo size source ${variant} (${reader.data.toString(
                    'base64'
                )})`
            )
    }
}

function parsePhotoFileLocation(
    reader: BinaryReader,
    version: number
): td.RawPhotoRemoteFileLocation {
    // todo: check how tdlib handles volume ids

    const id = reader.long()
    const accessHash = reader.long()
    let source: td.TypePhotoSizeSource

    if (version >= 32) {
        source = parsePhotoSizeSource(reader)
    } else {
        const volumeId = reader.long()
        let localId = 0

        if (version >= 22) {
            source = parsePhotoSizeSource(reader)
            localId = reader.int32()
        } else {
            source = {
                _: 'fullLegacy',
                secret: reader.long(),
                localId: reader.int32(),
                volumeId
            }
        }

        switch (source._) {
            case 'legacy':
                source = {
                    _: 'fullLegacy',
                    secret: reader.long(),
                    localId: reader.int32(),
                    volumeId
                }
                break
            case 'fullLegacy':
            case 'thumbnail':
                break
            case 'dialogPhoto':
                source = {
                    _: 'dialogPhotoLegacy',
                    id: source.id,
                    accessHash: source.accessHash,
                    big: source.big,
                    localId,
                    volumeId
                }
                break
            case 'stickerSetThumbnail':
                source = {
                    _: 'stickerSetThumbnailLegacy',
                    id: source.id,
                    accessHash: source.accessHash,
                    localId,
                    volumeId
                }
                break
            default:
                throw new td.InvalidFileIdError('Invalid PhotoSizeSource in legacy PhotoRemoteFileLocation')
        }
    }

    return {
        _: 'photo',
        id,
        accessHash,
        source
    }
}

function parseCommonFileLocation(
    reader: BinaryReader
): td.RawCommonRemoteFileLocation {
    return {
        _: 'common',
        id: reader.long(),
        accessHash: reader.long(),
    }
}

function fromPersistentIdV23(
    binary: Buffer,
    version: number
): td.RawFullRemoteFileLocation {
    if (version < 0 || version > td.CURRENT_VERSION)
        throw new td.UnsupportedError(
            `Unsupported file ID v3 subversion: ${version} (${binary.toString(
                'base64'
            )})`
        )

    binary = telegramRleDecode(binary)

    const reader = new BinaryReader(binary)

    let fileType = reader.int32()

    const isWeb = !!(fileType & td.WEB_LOCATION_FLAG)
    const hasFileReference = !!(fileType & td.FILE_REFERENCE_FLAG)

    fileType &= ~td.WEB_LOCATION_FLAG
    fileType &= ~td.FILE_REFERENCE_FLAG

    if (fileType < 0 || fileType >= td.FileType.Size)
        throw new td.UnsupportedError(
            `Unsupported file type: ${fileType} (${binary.toString('base64')})`
        )

    const dcId = reader.int32()

    let fileReference: Buffer | null = null
    if (hasFileReference) {
        fileReference = reader.bytes()
        if (fileReference.length === 1 && fileReference[0] === 0x23 /* # */) {
            // "invalid file reference"
            // see https://github.com/tdlib/td/blob/ed291840d3a841bb5b49457c88c57e8467e4a5b0/td/telegram/files/FileLocation.h#L32
            fileReference = null
        }
    }

    let location: td.TypeRemoteFileLocation
    if (isWeb) {
        location = parseWebFileLocation(reader)
    } else {
        switch (fileType) {
            case td.FileType.Photo:
            case td.FileType.ProfilePhoto:
            case td.FileType.Thumbnail:
            case td.FileType.EncryptedThumbnail:
            case td.FileType.Wallpaper: {
                // location_type = photo
                location = parsePhotoFileLocation(reader, version)

                // validate
                switch (location.source._) {
                    case 'thumbnail':
                        if (
                            location.source.fileType !== fileType ||
                            (fileType !== td.FileType.Photo &&
                                fileType !== td.FileType.Thumbnail &&
                                fileType !== td.FileType.EncryptedThumbnail)
                        ) {
                            throw new td.InvalidFileIdError(
                                'Invalid FileType in PhotoRemoteFileLocation Thumbnail'
                            )
                        }
                        break
                    case 'dialogPhoto':
                    case 'dialogPhotoLegacy':
                        if (fileType !== td.FileType.ProfilePhoto) {
                            throw new td.InvalidFileIdError(
                                'Invalid FileType in PhotoRemoteFileLocation DialogPhoto'
                            )
                        }
                        break
                    case 'stickerSetThumbnail':
                    case 'stickerSetThumbnailLegacy':
                    case 'stickerSetThumbnailVersion':
                        if (fileType !== td.FileType.Thumbnail) {
                            throw new td.InvalidFileIdError(
                                'Invalid FileType in PhotoRemoteFileLocation StickerSetThumbnail'
                            )
                        }
                        break
                }

                break
            }
            case td.FileType.Video:
            case td.FileType.VoiceNote:
            case td.FileType.Document:
            case td.FileType.Sticker:
            case td.FileType.Audio:
            case td.FileType.Animation:
            case td.FileType.Encrypted:
            case td.FileType.VideoNote:
            case td.FileType.SecureRaw:
            case td.FileType.Secure:
            case td.FileType.Background:
            case td.FileType.DocumentAsFile: {
                // location_type = common
                location = parseCommonFileLocation(reader)
                break
            }
            default:
                throw new td.UnsupportedError(
                    `Invalid file type: ${fileType} (${binary.toString(
                        'base64'
                    )})`
                )
        }
    }

    return {
        _: 'remoteFileLocation',
        dcId,
        type: fileType,
        fileReference,
        location,
    }
}

function fromPersistentIdV2(binary: Buffer) {
    return fromPersistentIdV23(binary.slice(0, -1), 0)
}

function fromPersistentIdV3(binary: Buffer) {
    const subversion = binary[binary.length - 2]
    return fromPersistentIdV23(binary.slice(0, -2), subversion)
}

/**
 * Parse TDLib and Bot API compatible File ID
 *
 * @param fileId  File ID as a base-64 encoded string or Buffer
 */
export function parseFileId(
    fileId: string | Buffer
): td.RawFullRemoteFileLocation {
    if (typeof fileId === 'string') fileId = parseUrlSafeBase64(fileId)

    const version = fileId[fileId.length - 1]

    if (version === td.PERSISTENT_ID_VERSION_OLD) {
        return fromPersistentIdV2(fileId)
    }

    if (version === td.PERSISTENT_ID_VERSION) {
        return fromPersistentIdV3(fileId)
    }

    throw new td.UnsupportedError(
        `Unsupported file ID version: ${version} (${fileId.toString('base64')})`
    )
}
