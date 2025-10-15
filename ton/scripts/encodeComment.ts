import { createInterface } from 'node:readline';

function isValidHex32Bytes(hex: string): boolean {
    const normalized = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
    return /^[0-9a-fA-F]{64}$/.test(normalized);
}

function hex32ToBuffer(hex: string): Buffer {
    const normalized = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
    return Buffer.from(normalized, 'hex');
}

function serialize(comment: string, destHex32: string, chainIdStr: string): Buffer {
    const chainId = parseInt(chainIdStr, 10);
    const commentBytes = Buffer.from(comment, 'utf8');
    if (commentBytes.length > 0xffff) {
        throw new Error('Comment too long: maximum is 65535 bytes when UTF-8 encoded');
    }
    if (!isValidHex32Bytes(destHex32)) {
        throw new Error('Destination must be 32 bytes hex (64 hex chars), with optional 0x prefix');
    }

    const out = Buffer.allocUnsafe(2 + 32 + commentBytes.length);
    out.writeUInt16BE(chainId, 0);
    hex32ToBuffer(destHex32).copy(out, 2);
    commentBytes.copy(out, 34);
    return out;
}

function main() {
    const [, , argChainId, argDest, argComment] = process.argv;
    let dest = argDest;
    let comment = argComment;
    let chainId = argChainId;

    if (!chainId || !comment || !dest) {
        console.error('Comment and destination are required');
        console.error('Usage: encodeComment.ts <chainId> <destination> <comment>');
        process.exit(1);
    }

    try {
        const buf = serialize(comment, dest, chainId);
        console.log(buf.toString('hex'));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Error:', message);
        process.exit(1);
    }
}

main();
