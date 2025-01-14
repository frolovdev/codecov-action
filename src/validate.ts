import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import * as core from '@actions/core';
import * as openpgp from 'openpgp';
import * as fetch from 'node-fetch';

import {
  BASEURL,
  getUploaderName,
  setFailure,
} from './helpers';

const verify = async (filename: string) => {
  try {
    const uploaderName = getUploaderName();

    // Read in public key
    const publicKeyArmored = await fs.readFileSync(
        path.join(__dirname, 'pgp_keys.asc'),
        'utf-8',
    );

    // Get SHASUM and SHASUM signature files
    const shasumRes = await fetch( `${BASEURL}.SHA256SUM`);
    const shasum = await shasumRes.text();

    const shaSigRes = await fetch( `${BASEURL}.SHA256SUM.sig`);
    const shaSig = await shaSigRes.text();

    // Verify shasum
    const verified = await openpgp.verify({
      message: await openpgp.cleartext.fromText(shasum),
      signature: await openpgp.signature.readArmored(shaSig),
      publicKeys: (await openpgp.key.readArmored(publicKeyArmored)).keys,
    });
    const {valid} = verified.signatures[0];
    if (valid) {
      core.info('==> SHASUM file signed by key id ' +
          verified.signatures[0].keyid.toHex(),
      );
    } else {
      setFailure('Codecov: Error validating SHASUM signature', true);
    }

    // Verify uploader
    const uploaderSha = crypto.createHash(`sha256`);
    const stream = fs.createReadStream(filename);
    await stream
        .on('data', (data) => {
          uploaderSha.update(data);
        }).on('end', async () => {
          const hash = `${uploaderSha.digest('hex')}  ${uploaderName}`;
          if (hash !== shasum) {
            setFailure(
                'Codecov: Uploader shasum does not match ' +
                  `uploader hash: ${hash}, public hash: ${shasum}`,
                true,
            );
          } else {
            core.info('==> Uploader SHASUM verified');
          }
        });
  } catch (err) {
    setFailure(`Codecov: Error validating uploader: ${err.message}`, true);
  }
};
export default verify;
