;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p5)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line


#|

[15 points]

Complete the design of the function below by writing the template origin tag
and the function definition.  

The function consumes a natural number n, and produces the sum of the integer
integer intervals [0, 0] [0, 1] ... [0, n]. So, for example:

   (sum-intervals 0) produces the sum of the single interval [0, 0], or
   (+ (+ 0))   

   (sum-intervals 3) produce the sum of [0, 0] [0, 1] [0, 2] and [0, 3], or
   
   (+ (+ 0)
      (+ 0 1)
      (+ 0 1 2)
      (+ 0 1 2 3))

Work carefully and test thoroughly. Don't be surprised if your first answer is
off by 1 or by more than 1. Just test and correct.


NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED sum-intervals.
 - You MUST NOT EDIT the provided @htdf tag, @signature tag, or purpose.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT the provided tests.
 - You MUST NOT EDIT any part of the file above the first line marked with ***.
 - You MUST NOT EDIT any part of the file below the second line marked with ***. (OPTIONAL)
 - You MUST FOLLOW all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - The function definition MUST call one or more built-in abstract functions.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers, but they must be defined within the the
   top-level function using local.

 - The function definition and any helper functions you design MUST NOT be
   recursive.

 - The result of the function must directly be the result of one of the
   built-in abstract functions. So, for example, the following would not
   be a valid function body:

       (define (foo x)
         (empty? (filter ...)))

   This would be a valid function body:

       (define (foo x)
         (local [(define (helper y) (foldr ... ... ...))]
           (helper ...)))

|#

(@htdf sum-intervals)
(@signature Natural -> Natural)
;; produce sum of [0, 0] [0, 1] ... [0, n]
(check-expect (sum-intervals 0) (+ 0))
(check-expect (sum-intervals 3) (+ (+ 0)
                                   (+ 1)
                                   (+ 0 1 2)
                                   (+ 0 1 2 3)))

;; *** MUST NOT EDIT ABOVE THIS LINE ***


(define (sum-intervals n) 0)
