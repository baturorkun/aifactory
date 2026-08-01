FROM nginx:1.27-alpine

COPY services/rag-web/nginx.conf /etc/nginx/templates/default.conf.template
COPY services/rag-web/public /usr/share/nginx/html

EXPOSE 8080
