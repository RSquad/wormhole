import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tolk',
    entrypoint: 'contracts/tests/executor.tolk',
    withStackComments: true,
    withSrcLineComments: true,
    experimentalOptions: '',
};


