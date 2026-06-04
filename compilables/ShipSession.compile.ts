import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tolk',
    entrypoint: 'contracts/ship_session/ship_session.tolk',
    withStackComments: true,
    withSrcLineComments: true,
    experimentalOptions: '',
};
