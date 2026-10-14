/**
 * MY EXPO BAG v1.0.1 — temporary exhibitor settings for the customer site.
 * Later these values will come from the exhibitor's admin screen.
 * No real brand or customer data is included here.
 */
window.MEB_CONFIG = {
  version: '1.0.1',
  brand: {
    id: 'fieldnote-demo',
    name: 'FIELDNOTE',
    tagline: 'Everyday objects, better stories.',
    description: '日々の暮らしと、週末の外遊びに。',
    logoUrl: '', // Example: './assets/brand-logo.png'
    themePreset: 'natural',
    customColors: { main: '', sub: '', text: '' },
  },
  event: {
    id: 'expo-demo-001',
    name: 'POP-UP EXHIBITION',
    accentLabel: 'EVENT EXCLUSIVE',
    banner: {
      enabled: true,
      eyebrow: 'PICK UP ITEM',
      title: 'この出会いが、次のお気に入りに。',
      body: '会場だけの特別なアイテムをチェック。',
      productId: 'lantern',
      imageUrl: '',
    },
  },
  categories: [
    { id: 'lights', name: 'ライト' },
    { id: 'furniture', name: 'ファニチャー' },
    { id: 'tableware', name: 'テーブルウェア' },
    { id: 'accessories', name: 'アクセサリー' },
  ],
  products: [
    { id: 'lantern', categoryId: 'lights', name: 'ポータブルランタン', subtitle: 'Portable Lantern', price: 4800, eventPrice: 4200, image: './assets/lantern.svg', tag: '人気商品', description: 'キャンプサイトでも自宅でも、やわらかな灯りを楽しめるコンパクトランタン。' },
    { id: 'table', categoryId: 'furniture', name: 'フォールディングテーブル', subtitle: 'Folding Table', price: 6500, eventPrice: 5900, image: './assets/table.svg', tag: '展示会特価', description: '持ち運びしやすく、さまざまなシーンに馴染むシンプルな折りたたみテーブル。' },
    { id: 'mug', categoryId: 'tableware', name: 'ステンレスマグ', subtitle: 'Steel Mug', price: 2400, eventPrice: null, image: './assets/mug.svg', tag: '', description: '手になじむフォルムと、日常使いにちょうど良いサイズ感。' },
    { id: 'chair', categoryId: 'furniture', name: 'コンパクトチェア', subtitle: 'Compact Chair', price: 9800, eventPrice: 8800, image: './assets/chair.svg', tag: 'おすすめ', description: '軽やかに持ち運べる、休日の特等席。' },
    { id: 'tote', categoryId: 'accessories', name: 'キャンバストート', subtitle: 'Canvas Tote', price: 3600, eventPrice: 3200, image: './assets/tote.svg', tag: '', description: 'タフで使いやすい、ほどよいサイズのキャンバスバッグ。' },
    { id: 'bottle', categoryId: 'tableware', name: 'スリムボトル', subtitle: 'Slim Bottle', price: 3100, eventPrice: 2800, image: './assets/bottle.svg', tag: '', description: 'すっきりした形状で、バッグにも収まりやすい携帯ボトル。' },
  ],
  bundles: [
    { id: 'outdoor-duo', name: 'LIGHT & TABLE', subtitle: '灯りとテーブルを一緒に。', productIds: ['lantern', 'table'], discountPercent: 10 },
    { id: 'relax-kit', name: 'RELAX KIT', subtitle: 'チェアとマグで、くつろぎの時間。', productIds: ['chair', 'mug'], discountPercent: 8 },
    { id: 'day-trip', name: 'DAY TRIP SET', subtitle: 'お出かけをスマートに。', productIds: ['tote', 'bottle'], discountPercent: 0 }, // 割引なしの組み合わせ表示テスト
  ],
  novelty: {
    enabled: true,
    name: 'オリジナルステッカー',
    minSpend: 8000,
    note: '会計時にスタッフがお渡しします。数量には限りがあります。',
  },
  line: {
    enabled: false, // LINE login will require business-managed authentication.
  },
};
