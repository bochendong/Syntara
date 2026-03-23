/**
 * 与 `public/avatars/notebook-agents/` 下已提交文件一致；新增图片时请同步更新本列表。
 * @see public/avatars/notebook-agents/README.md
 */
export const NOTEBOOK_AGENT_AVATAR_PUBLIC_PREFIX = '/avatars/notebook-agents/';

const FILENAMES = [
  '098c1ecf70d121464cad33f41b7ef899.avif',
  '2aa7885733b8c9a53019d6237d2de231.avif',
  '2fef8876495544eb5abcb7b2ab865533.avif',
  '31f133eead04d946af86d6b5de8c56e2.avif',
  '329c9c5037b1b2dfe1ed1c9819c9d787.avif',
  '36b93a5dc0072bbbd93084eb9f59d37e.avif',
  '3e7102da2b4a7ce41eab0f29dd2915ae.avif',
  '426de44a5f4778f301a78c2a1ea26dc0.avif',
  '44e7dcfb95cb5c708a901fb68861602d.avif',
  '4532fef66f534bb7c8fcbfc152c6b1bb.avif',
  '4d58bcc52908a313e0c51008ac26283c.avif',
  '502a2f6030748c4ca7718acaafa64625.avif',
  '5163c6a6500e2228f894e66ad9efb7fd.avif',
  '5350584370506858e5806b057bead43e.avif',
  '56ba0682c791470e6b79a5cbcd01ffc4.avif',
  '585c3917d64b1b60b19c58e2e67e57da.avif',
  '604fbc3cc04b2ce4e25292d765ae6b4e.avif',
  '61d9fd5c94c595bf1c171d0dc3877cf9.avif',
  '6780a045e68b7e346d02ee3226e23c1c.avif',
  '6a14aff5a6eb9b21db8ac90a4f07edf8.avif',
  '6a3e154cea47344338fdda662b020ed2.avif',
  '6bb212851c07c2722216b3211879b9dc.avif',
  '7c3058059434e4c7f46b55f32e152acb.avif',
  '7fd0670ec870b6e25d9e1ba485cf8211.avif',
  '830e70b1e01bdb8b0b656a529531fe3a.avif',
  '8333d7bae2f2f3f224458ac56f5e5997.avif',
  '85aa6c79bcfac1620e4beee90694b4f8.avif',
  '866c53f7e8fd8055372fe413b8989e7c.avif',
  '8806ffb091314b6ccbfdcaeef7b23a1e.avif',
  '8cc3928f5b0afee4e9808de934c90317.avif',
  '91e3af1fed53ecf7f12a7199cd26d3ca.avif',
  '92b0db45be8d172ea0891f3a353c85eb.avif',
  '99aa846dfc21fa47ee8384147f7ad15a.avif',
  '9c2638f3a53d6fb526d75c5cee685708.avif',
  '9ec0de778c4fac79e547ca21aa8f51f3.avif',
  'a35503bc5e4dacb942abc965d84c9da1.avif',
  'a46d5624ff471b829c368da15d006ad5.avif',
  'a6d8fec5ed488f0f2aa4a50999d77094.avif',
  'avatar1.avif',
  'avatar10.avif',
  'avatar2.avif',
  'avatar3.avif',
  'avatar4.avif',
  'avatar5.avif',
  'avatar6.avif',
  'avatar7.avif',
  'avatar8.avif',
  'avatar9.avif',
  'b143f5387a38551d56626a9b815132f4.avif',
  'b405b8d4c59bc42b3229eb179484ca1b.avif',
  'b5fe79c6e80d3e51b7b271e563c45d77.avif',
  'be039620174dc1ad7527b5bf9685ded6.avif',
  'c4c685155ada6e3beb54b3eefbfe09d7.avif',
  'c5b76c6726977cf6b47bca07b399fd8e.avif',
  'c7791d9e4257bbaaf49f1d221adff17a.avif',
  'c83c0ff05b18257d1ccd5b9e6ba788dd.avif',
  'c85884b3a25d90b3bacf63fd21e3437f.avif',
  'cafb3639f62e9fe51559d95dc7f007d7.avif',
  'cc5659b770317c4fd3c76d578bc8bef0.avif',
  'd83e9556f3d1f6140ecd349fb1f0ddfa.avif',
  'e1355839192acde894b22f6c8dd771a3.avif',
  'e35c3eda684d2639401d4a6d16758b03.avif',
  'ef1d1ffb3e12d6872b9989cf06387e7b.avif',
  'f191cc50acd01c7a87066603ae3f9fd3.avif',
  'f745e556382e8d33e3b33ecfceb86986.avif',
  'f9b5bf5b6e8d31e2774a1f273d6316de.avif',
  'fa05e2e79e241061ca155eb9b3adf3e7.avif',
  'fee946834bf9ac4811a56e7c783b5e95.avif',
  'ffbc02b6ca09e21ec19aa4b49cbc0947.avif',
] as const;

const FILES: readonly string[] = FILENAMES;

function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 随机选一张 notebook-agents 头像的完整 public URL 路径 */
export function pickRandomNotebookAgentAvatarUrl(): string {
  if (FILES.length === 0) return '/avatars/assist-2.png';
  const i = Math.floor(Math.random() * FILES.length);
  return `${NOTEBOOK_AGENT_AVATAR_PUBLIC_PREFIX}${FILES[i]}`;
}

/**
 * 按 seed（建议用笔记本 stageId）稳定映射到一张头像，同一笔记本始终相同、且会持久化在 IndexedDB。
 */
export function pickStableNotebookAgentAvatarUrl(seed: string): string {
  if (FILES.length === 0) return '/avatars/assist-2.png';
  const i = hashStringToUint32(seed) % FILES.length;
  return `${NOTEBOOK_AGENT_AVATAR_PUBLIC_PREFIX}${FILES[i]}`;
}
