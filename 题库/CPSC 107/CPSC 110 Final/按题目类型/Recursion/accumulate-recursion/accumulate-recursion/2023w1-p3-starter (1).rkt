;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2023w2-f/f-p3) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

#|

Complete the design of the function below by writing the template origin tag
and the function definition.  

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED sum-max-so-far.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT any part of the file above the line marked with ***.
 - You MUST FOLLOW all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers, but they must be defined within the top-level
   function using local.

 - Treat this as an accumulator problem. Your function should go through the
   list once only, and must not call any built-in abstract functions. Provide
   a type and invariant for each accumulator you use.

|#

(@htdf sum-max-so-far)
(@signature (listof Integer) -> Integer)
;; sum elements of loi that are greater than any number before them
(check-expect (sum-max-so-far empty)              0)
(check-expect (sum-max-so-far (list 2 4 6))       (+ 2 4 6))
(check-expect (sum-max-so-far (list 1 2 1 3 3))   (+ 1 2 3))
(check-expect (sum-max-so-far (list 3 2 4 5 2 5)) (+ 3 4 5))

;; *** MUST NOT EDIT ANY LINE ABOVE HERE ***

(define (sum-max-so-far loi) 0) ;stub

