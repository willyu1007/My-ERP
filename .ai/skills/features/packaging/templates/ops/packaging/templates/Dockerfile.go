# Go Dockerfile Template
# Copy this file to services/<name>.Dockerfile and customize

FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/main .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/main .

USER nobody
EXPOSE 8080
CMD ["./main"]

