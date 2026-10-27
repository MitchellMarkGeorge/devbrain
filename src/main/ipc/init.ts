import { initIpc } from '@common/ipc/procedure';
import type { AppContext } from './context';

// the builder every router in src/main/ipc/routers uses
export const t = initIpc<AppContext>();
