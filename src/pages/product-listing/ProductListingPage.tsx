import React from 'react';

const ProductListingPage: React.FC = () => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>上货管理</h2>
        <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>
          商品采集、编辑和提交微信小店的独立工作区。当前阶段先建立模块边界，后续采集功能在这里落地。
        </p>
      </div>
    </div>
  );
};

export default ProductListingPage;
