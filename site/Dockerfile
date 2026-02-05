FROM golang:1.22-alpine AS build
WORKDIR /app
COPY server ./server
RUN cd server && go build -o /out/site .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/site /app/site
ENV PORT=9000
ENV INSTANCE_ID=site-unknown
EXPOSE 9000
CMD ["/app/site"]
