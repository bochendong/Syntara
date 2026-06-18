;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p5)

(@cwl ???) ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line 
(@problem 2) ;do not edit or delete this line 
(@problem 3) ;do not edit or delete this line 
(@problem 4) ;do not edit or delete this line 
(@problem 5) ;do not edit or delete this line 

#|

Complete the design of the following function by writing the template tag
and the function definition.  

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

  - Files must not have any errors when the Check Syntax button is pressed.
    Press Check Syntax and Run often, and correct any errors early.

  - The function definition MUST call one or more built-in abstract functions.

  - For maximum credit the function definition should use the most clear
    and expressive combination of abstract functions.  In particular, do
    not use foldr for everything just because you can use foldr for
    everything.

  - The function definition MUST NOT be recursive.

  - The function definition MUST NOT use any part of the recursive Natural
    template or the (listof X) template.

      - it must not include (cond [(empty? ... anywhere
      - it must not include (cond [(zero? ... anywhere

  - The result of the function must directly be the result of one of the
    built-in abstract functions. So, for example, the following is not
    a valid function body:

       (define (foo x)
         (empty? (filter ...)))

  - You MUST NOT change or comment out any check-expects, but you are free
    to add new ones.

|#


(@htdd Person)
(define-struct person (name age eye-color))
;; Person is (make-person String Natural String)
;; interp. a person with first name, age, and eye color
(define P1 (make-person "Azi" 25 "brown"))
(define P2 (make-person "Ari" 30 "green"))
(define P3 (make-person "Rey" 35 "hazel"))
(define P4 (make-person "Teri" 40 "green"))

(@htdf names-with-eye-color)
(@signature String (listof Person) -> (listof String))
;; produce list of names of people with given eye color
(check-expect (names-with-eye-color "brown" empty) empty)
(check-expect (names-with-eye-color "hazel" (list P2 P3))
              (list "Rey"))
(check-expect (names-with-eye-color "blue" (list P1 P2 P3 P4))
              empty)
(check-expect (names-with-eye-color "green" (list P1 P2 P3 P4))
              (list "Ari" "Teri"))

(define (names-with-eye-color color lop) empty) ; stub
