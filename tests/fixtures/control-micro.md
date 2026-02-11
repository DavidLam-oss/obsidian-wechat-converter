## micro-1 link-protocol
[ok-http](https://example.com)
[ok-mail](mailto:a@b.com)
[ok-obsidian](obsidian://open?vault=MyVault)
[bad-js](javascript:alert(1))
![ok-data-img](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)

## micro-2 deep-list
1. **标签：** 主项
   - 子项 A
     1. `code:` 子子项 A.1
        - 最深层
2. 第二项

## micro-3 sanitize-html
<script>alert("xss")</script>
<img src="x" onerror="alert(1)">
<iframe src="https://evil.com"></iframe>
正常文本 **保留**
