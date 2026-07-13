FROM golang:1.26-alpine AS build
WORKDIR /src
RUN apk add --no-cache build-base
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o /notavia-server ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /notavia-server /usr/local/bin/notavia-server
RUN mkdir -p /app/data/uploads
EXPOSE 3001
CMD ["notavia-server"]
