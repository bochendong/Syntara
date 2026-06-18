;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023s-f/f-p5)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line


#|

Complete the design of the function below.

Note that to make this function easier to design we have included TWO HELPER 
FUNCTIONS as follows:

 (box "red") produces (square 20 "solid" "red")

 (b/a-b <image1> <image2>) produces (beside/align "bottom" <image1> <image2>)


The function you must design consumes a list of lists of color names and
produce an image formed of stacked boxes of those colors. 

For maximum credit your function definition must have:

  - exactly two calls to foldr and two calls to map, OR
  - exactly two calls to foldr

Your answer must include a @template-origin tag and a correct function
definition.

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED stack-boxes.
 - You MUST NOT EDIT the provided @htdf tag, @signature tag, or purpose.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT the provided tests.
 - You MUST NOT EDIT any part of the file above the first line marked with ***.
 - You MUST NOT EDIT any part of the file below the second line marked with ***.
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

(@htdf stack-boxes)
(@signature (listof (listof String)) -> Image)
;; produce stacks of color boxes, beside each other, bottom-aligned
(check-expect (stack-boxes empty) empty-image)
(check-expect (stack-boxes (list (list "red")))
              (b/a-b (above (box "red")
                          empty-image)
                   empty-image))
(check-expect (stack-boxes (list (list "red")
                                 (list "blue" "green" "yellow")
                                 (list "orange" "grey")))
              (b/a-b (above (box "red")
                          empty-image)
                   (b/a-b (above (box "blue")
                               (box "green")
                               (box "yellow")
                               empty-image)
                        (b/a-b (above (box "orange")
                               (box "grey")
                               empty-image)
                             empty-image))))

;; *** MUST NOT EDIT ABOVE THIS LINE ***


(define (stack-boxes lolos) empty-image)






;; *** MUST NOT EDIT BELOW THIS LINE ***

(@htdf box)
(@signature String -> Image)
;; produce 20x20 box of given color
(check-expect (box "red") (square 20 "solid" "red"))
(check-expect (box "blue") (square 20 "solid" "blue"))

(@template-origin String)

(define (box s) (square 20 "solid" s))


(@htdf b/a-b)
(@signature Image Image -> Image)
;; place images beside each other aligned on their bottom edge
(check-expect (b/a-b (box "red") (box "blue"))
              (beside/align "bottom" (box "red") (box "blue")))
(check-expect (b/a-b (box "pink") (box "green"))
              (beside/align "bottom" (box "pink") (box "green")))

(@template-origin String)

(define (b/a-b a b) (beside/align "bottom" a b))
