FROM golang:1.22-alpine AS build
WORKDIR /app
COPY server ./server
RUN cd server && go build -o /out/center .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/center /app/center
COPY web /app/web
ENV PORT=8080
EXPOSE 8080
CMD ["/app/center"]
