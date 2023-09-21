/* 
1. Admins should be able to enable or disable the availability of a course
*/
-- enable / disable a course
-- enable = 1 disable = 0
UPDATE courses SET IsAvailable = 1 WHERE CourseID = 4;


/*
2. Admins should be able to assign one or more courses to a teacher
*/

-- update ? with input parameters
UPDATE courses SET TeacherID = 8 WHERE CourseID = 4;


/*
3. Students can browse amd list all the available courses and see the course title and course teacher's name
*/

-- course is available if 1 and not if 0

SELECT courses.CourseID, courses.Title, users.UserID AS TeacherID, users.Name AS TeacherName
FROM courses
JOIN users ON courses.TeacherID = users.UserID
WHERE courses.IsAvailable = 1;


/* 
4. Students can enrol in a course. Students should not be able to enrol in a course more than once at each time
*/

-- update ? with input parameters

INSERT INTO enrolments (Mark, CourseID, UserID) VALUES (NULL, 4, 10);


/*
5. teachers can fail or pass a student
*/

-- update ? with input parameters

UPDATE enrolments SET Mark = 1 WHERE CourseID = 4 AND UserID = 10;


/* 
Access control for Admins, Teachers and Students: Ensure only the authorised access can perform an action. 
For example, only teachers can pass/fail a student.
*/

/* 
In the API, on every request get the primary key of a user as part of the request/input parameters adn before performing an
an action, check if the user with the primary key is authorised to perform a request
*/