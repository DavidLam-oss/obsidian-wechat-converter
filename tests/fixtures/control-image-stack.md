# Native 图像密集样本（回归）

这个样本用于覆盖“多图 + 列表 + callout + 代码块 + 数学表达”混合场景。

## 图片序列 A（远程）

![img-a1](https://picsum.photos/seed/native-a1/800/450)
![img-a2](https://picsum.photos/seed/native-a2/800/450)
![img-a3](https://picsum.photos/seed/native-a3/800/450)
![img-a4](https://picsum.photos/seed/native-a4/800/450)

## 图片序列 B（本地与 wikilink）

![[attachments/gallery-01.png]]
![[attachments/gallery-02.png]]
![](attachments/gallery-03.png)
![](attachments/gallery-04.png)

## 混合内容

> [!note] 编辑提示
> 这是一段用于模拟真实写作中的说明块。

- 发布前检查
  - 图片是否都能加载
  - 代码块是否可读
  - 公式是否正常显示
    1. 行内：$E=mc^2$
    2. 块级：

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$

```javascript
const checklist = ['image', 'code', 'math', 'links'];
for (const item of checklist) {
  console.log('verify:', item);
}
```

最后一段用于模拟图文后的人类收尾语气。
