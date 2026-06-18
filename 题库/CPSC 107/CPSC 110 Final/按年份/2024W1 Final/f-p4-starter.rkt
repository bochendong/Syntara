;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)
(@assignment exams/2024w1-f/f-p4) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


(define THICKNESS 2)

#|

Carefully study the explanation in f-p4-figure.pdf, then complete the design
of the function below by writing appropriate tests, the template origin tag,
and the function definition.  

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED ray-star.

 - You MUST USE the provided THICKNESS constant.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - You MUST FOLLOW all applicable design rules.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - We are providing one check-expect, which you MUST NOT EDIT OR COMMENT OUT.

 - You must add more tests.

 - The function definition MUST call one or more built-in abstract functions.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers, but they must be defined within the top-level
   function using local.

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

(@htdf ray-star)
(@signature Number Natural Color -> Image)
;; produce n lines overlaid on centers, rotated 360/n each from the previous
(check-expect (ray-star 100 3 "red")
              (overlay (rotate   0 (rectangle 100 THICKNESS "solid" "red"))
                       (rotate 120 (rectangle 100 THICKNESS "solid" "red"))
                       (rotate 240 (rectangle 100 THICKNESS "solid" "red"))))

(define (ray-star diameter n-lines color) empty-image) ;stub
