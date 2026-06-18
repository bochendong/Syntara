;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p7)

(@cwl ???) ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line 
(@problem 2) ;do not edit or delete this line 
(@problem 3) ;do not edit or delete this line 
(@problem 4) ;do not edit or delete this line 
(@problem 5) ;do not edit or delete this line 
(@problem 6) ;do not edit or delete this line 
(@problem 7) ;do not edit or delete this line 

#|

Consider these data definitions:

|#

(@htdd Star)

(define-struct star (nm mag lon))
;; Star is (make-star String Number (listof String))
;; interp. a star having a name, magnitude (brightness), and list of names of
;; stars to which it is connected in its constellation.
;;
;; Stars form a generative graph using the lookup-star function (see below).

;;
;; A diagram of this constellation is one of the handouts you were given.
;;
(define AURIGA
  (list (make-star "Capella" 0.2
                   (list "Delta Aur" "Menkalinan" "Haedus" "Almaaz"))
        (make-star "Delta Aur" 3.9
                   (list "Capella" "Menkalinan"))
        (make-star "Menkalinan" 1.9
                   (list "Delta Aur" "Mahasim" "Capella"))
        (make-star "Mahasim" 2.6
                   (list "Menkalinan" "Hassaleh"))
        (make-star "Hassaleh" 2.8
                   (list "Mahasim" "Haedus"))
        (make-star "Haedus" 3.1
                   (list "Hassaleh" "Capella" "Saclateni"))
        (make-star "Saclateni" 3.9
                   (list "Haedus" "Almaaz"))
        (make-star "Almaaz" 3.1
                   (list "Saclateni" "Capella"))
        (make-star "Sigma Aur" 5.2
                   empty))) 


(@template-origin encapsulated genrec Star (listof String))

(define (fn-for-constellation s)
  (local [(define (fn-for-star s)
            (... (star-nm s)
                 (star-mag s)
                 (fn-for-lon (star-lon s))))

          (define (fn-for-lon lon)    ;lon is list of star names (listof String)
            (cond [(empty? lon) (...)]  
                  [else
                   (... (fn-for-star (lookup-star (first lon)))
                        (fn-for-lon (rest lon)))]))]
    
    (fn-for-star s)))

;;
;; Consider this to be a primitive function that comes with the data definitions
;; and that given a star name it produces the corresponding star.  Because
;; this consumes a string and generates a star calling it will amount to a
;; generative step in a recursion through a constellation of stars (a graph).
;;
(@htdf lookup-star)
(@signature String -> Star)

(define (lookup-star name)
  (local [(define (scan lst)
            (cond [(empty? lst) (error "No star named " name)]
                  [else
                   (if (string=? (star-nm (first lst)) name)
                       (first lst)
                       (scan (rest lst)))]))]
    (scan AURIGA)))


#|

Complete the design of the following function by writing the template tag
and the function definition.

The phrase "strictly increasing magnitude" in the function purpose
means each magnitude is greater than the one before it.

     - the numbers 1 2 2.1 3 are strictly increasing
     - the numbers 1 2 2 3 are not strictly increasing

Remember that -inf.0 is a number less than all other numbers.


For MAXIMUM CREDIT your function definition must be tail recursive, but a
correctly functioning non-tail recursive function definition will receive
more marks than an incorrect tail recursive definition. Specifically, a
fully correct tail recursive version will be worth 5% of the total exam
grade more than a fully correct non-tail recursive version.

NOTE: You may want to develop both tail recursive and non tail-recursive
function definitions. If you do, then, in your final submission YOU MUST
COMMENT OUT ONE OF THE TWO. We will only grade the non-commented solution.
To be more clear:

  - if you submit two function definitions, and they are both commented
    out, then you will receive 0 marks

  - if you submit two function definitions, and neither one is commented
    out, then you will receive 0 marks


Also note that your @template-origin tag that must match the function definition
that is graded.

This function operates on a graph, so a termination argument is required.
As well, accumulator types and invariants are required if you use any
accumulators.

This problem will be autograded and may also be TA graded.  NOTE that all
of the following are required. Violating one or more will cause your solution 
to receive 0 marks.

  - Files must not have any errors when the Check Syntax button is pressed.
    Press Check Syntax and Run often, and correct any errors early.

  - You MUST use the provided templates, and you MUST NOT rename any of
    the local function definitions inside the template.

  - You MUST NOT change or comment out any check-expects, but you are free
    to add new ones.

  - You MUST NOT edit the AURIGA constant and you MUST NOT edit the lookup-star
    function definition.

|#

(@htdf increasing-magnitude-path)
(@signature Star String -> (listof String) or false)
;; produce path from s0 to sn with strictly increasing magnitude; or fail
(check-expect (increasing-magnitude-path (lookup-star "Capella") "Sigma Aur")
              false)
(check-expect (increasing-magnitude-path (lookup-star "Mahasim") "Mahasim")
              (list "Mahasim"))
(check-expect (increasing-magnitude-path (lookup-star "Capella") "Hassaleh")
              (list "Capella" "Menkalinan" "Mahasim" "Hassaleh"))


(define (increasing-magnitude-path s0 to-sn) false) ;stub
         
(@template-origin encapsulated genrec Star (listof String))

#;
(define (fn-for-constellation s)
  (local [(define (fn-for-star s)
            (... (star-nm s)
                 (star-mag s)
                 (fn-for-lon (star-lon s))))

          (define (fn-for-lon lon)    ;lon is list of star names (listof String)
            (cond [(empty? lon) (...)]  
                  [else
                   (... (fn-for-star (lookup-star (first lon)))
                        (fn-for-lon (rest lon)))]))]
    
    (fn-for-star s)))
