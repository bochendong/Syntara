;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w2-f/f-p1) ;Do not edit or remove this tag

(@cwl ???)

(@problem 1) ;do not edit or delete this line


#|

Carefully study the explanation in f-p1-figure.pdf, then complete the design
of the function below by writing the template origin tag and the function
definition.  

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED rectangles.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST FOLLOW all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

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

(@htdf rectangles)
(@signature Natural Number Number Color -> Image)
;; produce n overlaid rectangles of color c, from size w, h to size h, w
;; CONSTRAINT: n is >= 2
(check-expect (rectangles 2 20 100 "blue")
              (overlay (rectangle 20  100 "outline" "blue")
                       (rectangle 100  20 "outline" "blue")))

(check-expect (rectangles 4 50 125 "red")
              (overlay (rectangle 50  125 "outline" "red")
                       (rectangle 75  100 "outline" "red")
                       (rectangle 100  75 "outline" "red")
                       (rectangle 125  50 "outline" "red")))

(define (rectangles n w h c) empty-image) ;stub

