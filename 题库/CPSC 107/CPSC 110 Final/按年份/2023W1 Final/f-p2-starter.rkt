;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w1-f/f-p2) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line



#|

Complete the design of the function below by writing the template origin tag
and the function definition. You will want to use the crop function, which is
called as follows:

   (crop x y w h image)

where image is cropped to the rectangle with upper left at the point (x, y)
and with width and height w and h.



NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED flip-image-chunks.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT the provided tests.
 - You MUST NOT EDIT any part of the file above the first line marked with ***.
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

(@htdf flip-image-chunks)
(@signature Image Natural -> Image)
;; produce given i cut into n chunks and recombined in reverse order
;; CONSTRAINT: n > 0
(check-expect (flip-image-chunks empty-image 1) empty-image)
(check-expect (flip-image-chunks empty-image 2) empty-image)
(check-expect (flip-image-chunks (circle 20 "solid" "red") 1)
              (circle 20 "solid" "red"))
(check-expect (flip-image-chunks (circle 20 "solid" "red") 4)
              (beside (crop 30 0 10 40 (circle 20 "solid" "red"))
                      (crop 20 0 10 40 (circle 20 "solid" "red"))
                      (crop 10 0 10 40 (circle 20 "solid" "red"))
                      (crop  0 0 10 40 (circle 20 "solid" "red"))))


;; *** Must not edit any line above here. ***




