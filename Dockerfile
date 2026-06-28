FROM openjdk:17-jdk-alpine
COPY target/myapp.jar app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
