# 基础镜像（Alpine 版）
FROM nginx:1.27-alpine

# Alpine 镜像的 nginx 模板目录是 /etc/nginx/templates，渲染后到 /etc/nginx/conf.d
# 复制模板文件到正确目录
COPY nginx/default.conf.template /etc/nginx/templates/

# 确保 nginx 配置目录权限正确
RUN chmod 755 /etc/nginx/conf.d && chmod 644 /etc/nginx/templates/default.conf.template

# 暴露端口
EXPOSE 80

# 启动 nginx（前台运行）
CMD ["nginx", "-g", "daemon off;"]