#!/bin/bash

# 定义插件名称
PLUGIN_NAME="obsidian-wechat-converter"
ZIP_FILE="${PLUGIN_NAME}.zip"

echo "📦 开始打包 $PLUGIN_NAME..."

# 删除旧的 zip 文件
if [ -f "$ZIP_FILE" ]; then
    rm "$ZIP_FILE"
fi

# 打包必要文件
# 注意：由于本插件采用动态加载，必须包含 converter.js, lib/ 和 themes/
zip -r "$ZIP_FILE" \
    main.js \
    manifest.json \
    styles.css \
    converter.js \
    lib/ \
    themes/ \
    images/ \
    README.md \
    LICENSE \
    -x "*.DS_Store*"

echo "✅ 打包完成: $ZIP_FILE"
echo "👉 现在你可以将此文件上传到 GitHub Release 的 Assets 中了。"
