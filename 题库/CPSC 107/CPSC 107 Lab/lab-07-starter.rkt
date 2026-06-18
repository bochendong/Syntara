;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname lab-07-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require racket/file)

(@assignment 107/labs/lab-07)
(@cwl ???) 

;; CPSC 107 - Paths Lab

(@problem 1)
;; The first four problems use the following data definition,
;; which represents a path through a binary search tree.

(@htdd Path)
;; Path is one of:
;; - empty
;; - (cons "L" Path)
;; - (cons "R" Path)
;; interp. 
;;  A sequence of left and right 'turns' down through a BinaryTree
;;  (list "L" "R" "R") means take the left child of the root, then
;;  the right child of that node, and the right child again.
;;  empty means you have arrived at the destination.
(define P1 empty)
(define P2 (list "L" "R"))
(define P3 empty)
(define P4 (cons "L" (cons "R" empty)))
(define P5 (cons "L" (cons "R" (cons "R" empty))))

(@dd-template-rules one-of atomic-distinct self-ref self-ref)
(define (fn-for-path p)
  (cond [(empty? p) (...)]
        [(string=? (first p) "L") (... (fn-for-path (rest p)))]
        [(string=? (first p) "R") (... (fn-for-path (rest p)))]))




;; PROBLEM 1:
;;
;; Design an abstract function (including signature, purpose, and tests)
;; called num-lr to simplify the lefts-minus-rights and rights-minus-lefts
;; functions defined below.
;;
;; Then re-define the original lefts-minus-rights and rights-minus-lefts
;; functions to use your abstract function. Remember, the signature and tests
;; should not change from the original functions. For simplicity, assume 
;; that all numbers throughout this problem have type Integer. For full
;; marks, list functions at the start of signatures, e.g.
;; (@signature (String -> String) Integer -> String), NOT
;; (@signature Integer (String -> String) -> String).

(@htdf lefts-minus-rights)
(@signature Path -> Integer)
;; produce the difference between left turns and right turns
(check-expect (lefts-minus-rights empty) 0)
(check-expect (lefts-minus-rights (list "R" "L" "R")) -1)
(check-expect (lefts-minus-rights (list "L" "R" "L")) 1)

(@template-origin Path)
(define (lefts-minus-rights p)
  (cond [(empty? p) 0]
        [(string=? (first p) "L") (add1 (lefts-minus-rights (rest p)))]
        [(string=? (first p) "R") (sub1 (lefts-minus-rights (rest p)))]))


(@htdf rights-minus-lefts)
(@signature Path -> Integer)
;; produce the difference between right turns and left turns
(check-expect (rights-minus-lefts empty) 0)
(check-expect (rights-minus-lefts (list "R" "L" "R")) 1)
(check-expect (rights-minus-lefts (list "L" "R" "L")) -1)

(@template-origin Path)
(define (rights-minus-lefts p)
  (cond [(empty? p) 0]
        [(string=? (first p) "L") (sub1 (rights-minus-lefts (rest p)))]
        [(string=? (first p) "R") (add1 (rights-minus-lefts (rest p)))]))




;; Use the space below to design the abstract function for Problem 1:

;(@htdf num-lr) ; UNCOMMENT this when you start the problem!


















;; Problem 2
;;
;; Use your abstract function from the previous problem to design a function
;; called path-length that determines the length of a given path.

(@problem 2)
;(@htdf path-length)  ; UNCOMMENT this when you start the problem!
















;; Problem 3
;;
;; Complete the design of the following abstract fold function for Path.
;; Note that we have already given you the actual function definition and the
;; template origin tag. You must complete the design with a signature,
;; purpose, and the two following check-expects:
;;
;;   - uses the fold function to produce a copy of (list "R" "L" "R")
;;   - uses the fold function to produce the number of "L"s minus the
;;     number of "R"s in the list (list "R" "L" "R"), which is -1
;;

(@problem 3)
(@htdf fold-path)





(@template-origin Path)

(define (fold-path c1 c2 b p)
  (cond [(empty? p) b]
        [(string=? (first p) "L") (c1 (fold-path c1 c2 b (rest p)))]
        [(string=? (first p) "R") (c2 (fold-path c1 c2 b (rest p)))]))













;; Problem 4
;;
;; Use your fold-path function called path-string to design a function called
;; path-string that produces a single string that concatenates all of the turns
;; in a path.

(@problem 4)
;(@htdf path-string) ; UNCOMMENT this when you start the problem!















;; Problem 5 - OPTIONAL - WON'T BE GRADED BY THE AUTOGRADER
;;
;; Design a function called popular-spring-class-count that takes a list of
;; class data and produces the number of classes from Term 2 where enrollment
;; exceeded 70% capacity (that is, enrollment / capacity > 0.7).
;;
;; The function that you design must make at least one call to 
;; built-in abstract functions.

(@htdd Class)
(define-struct class (id sec term credits enrolled capacity title))
;; Class is (make-class String String Natural[1,2]
;;             Natural Natural Natural[>0] String)
;; interp. (make-class id sec term credits enrolled capacity title) is
;; data about a UBC CS class where:
;; - id is the class identifier
;; - sec is the class section
;; - term is the term during which the class is held
;; - credits is the number of credits the course is worth
;; - enrolled is the number of students enrolled
;; - capacity is the number of students that could be enrolled
;; - title is an abbreviated title for the course

(define C0 (make-class "CPSC229" "202" 2 4 40 84 "CMPTNL BSKT WVNG"))
(define C1 (make-class "CPSC259" "201" 2 4 190 188 "DTA&ALG ELEC ENG"))
(define C2 (make-class "CPSC400" "123" 1 0 190 188 "SNRITIS FOR MJRS"))

(@dd-template-rules compound)
(define (fn-for-class c)
  (... (class-id c)
       (class-sec c)
       (class-term c)
       (class-credits c)
       (class-enrolled c)
       (class-capacity c)
       (class-title c)))


;; If you would like to use the real daily class data from
;; UBC Pair (http://pair.ubc.ca), 
;; place the pair.ss file in your current directory and uncomment
;; the following definition and add the given check-expect to your
;; examples.

#;
(define COURSE-DATA 
  (local [(define (data->class d)
            (make-class (first d) (second d) (third d) (fourth d)
                        (fifth d) (sixth d) (seventh d)))]
    (map data->class (file->value "pair.ss"))))
#;
(check-expect (popular-spring-class-count COURSE-DATA) 28)



;; Use the space below to design the function for Problem 5:
(@problem 5)
;(@htdf popular-spring-class-count) ; UNCOMMENT this when you start the problem!


















