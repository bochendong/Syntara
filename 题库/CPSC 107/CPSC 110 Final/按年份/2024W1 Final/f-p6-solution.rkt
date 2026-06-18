;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p6) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line

;;
;; Consider the following data definition for a graph, which you saw earlier
;; this term.  But note that the sample graph, shown in f-p5-6-figure.pdf is
;; different than what you saw previously.
;;

;; =================
;; Data Definitions: 

(@htdd Node)
(define-struct node (number nexts))
;; Node is (make-node Natural (listof Natural))
;; interp. node's number, and list of numbers of nodes that the arrows point to

(define N101 (make-node 101 (list 102 107 108)))


#|
 A Map is AN OPAQUE DATA STRUCTURE that represents one or more distinct graphs.
 OPAQUE means you can't look inside it.  THE ONLY THING YOU ARE  ALLOWED TO DO
 WITH A MAP IS PASS IT TO generate-node.

 generate-node is defined at the bottom of the file. You should treat it as a
 primitive function described as follows:

 generate-node
 Map Natural -> Node

 If a node with the given number exists in map then produce it.
 Signal an error if no node with the given number exists in the map.

 The bottom of the file defines a map called MAP for the graphs shown in
 this figure:

   https://cs110.students.cs.ubc.ca/exams/2024w1-f/f-p5-6-figure.pdf
 
 But the functions you design must work for any map.
|#

;;
;; Here are normal recursion and tail recursion templates.
;;

(@template-origin encapsulated Node (listof Natural) genrec)
#;
(define (fn-for-graph/nr map start)  
  (local [(define (fn-for-node n)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn nexts)])))
          
          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (fn-for-node (generate-node map (first lonn)))
                        (fn-for-lonn (rest lonn)))]))]
    
    (fn-for-? ...start)))

(@template-origin encapsulated Node (listof Natural) genrec accumulator)
#;
(define (fn-for-graph/tr map start)
  ;; nn-wl is (listof Natural)
  ;; node-number worklist; unvisited direct next nodes of the visited nodes
  (local [(define (fn-for-node n nn-wl)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn (append nexts nn-wl))])))
          
          (define (fn-for-lonn nn-wl)
            (cond [(empty? nn-wl) (...)] 
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl))]))]

    (fn-for-? ...start)))

#|

Complete the design of the following function that consumes a MAP, the number
of a start node, and the number of a destination node.

- You function must be tail recursive and you MUST USE THE TAIL RECURSION
  TEMPLATE PROVIDED BELOW.

- The function should search for the first path from start to destination that
  only includes ODD NUMBERED nodes.

- If it finds such a path it should produce the value of the visited accumulator
  including the destination node number as the first element of the list and the
  start node number as the last element of the list.

NOTE THAT THIS DOES NOT REQUIRE TANDEM WORKLISTS. YOU MAY USE ONE IF YOU CHOOSE
BUT THEY ARE NOT REQUIRED AND WILL ONLY COMPLICATE YOUR SOLUTION.

HINT: Start by using the EXAMPLES STEP OF THE RECIPE. Carefully work through
some examples and be sure you understand why a path accumulator is not required.

We are providing one complex check-expect. You must add others.

|#

#|
(@htdf odd-path-visited)
(@signature Map Natural Natural -> (listof Natural) or false)
;; find first odd numbered only path from start to dest, produce visited

(check-expect (odd-path-visited MAP   101 109)
              (list 109 105 103 107 101))

(@template-origin encapsulated Node (listof Natural) genrec accumulator)

(define (fn-for-graph/tr map start dest)
  ;; nn-wl is (listof Natural)
  ;; node-number worklist; unvisited direct next nodes of the visited nodes
  (local [(define (fn-for-node n nn-wl)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn (append nexts nn-wl))])))
          
          (define (fn-for-lonn nn-wl)
            (cond [(empty? nn-wl) (...)] 
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl))]))]

    (fn-for-? ...start)))
|#


(@htdf odd-path-visited)
(@signature Map Natural Natural -> (listof Natural) or false)
;; find first odd numbered only path from start to dest, produce visited
(check-expect (odd-path-visited MAP   1 5)  (list 5 3 1))
(check-expect (odd-path-visited MAP   1 8)  false)

(check-expect (odd-path-visited MAP   11 11)  (list 11))
(check-expect (odd-path-visited MAP   11 15)  (list 15 11))
(check-expect (odd-path-visited MAP   11 17)  false)

(check-expect (odd-path-visited MAP   101 109)
              (list 109 105 103 107 101))

(@template-origin encapsulated Node (listof Natural) genrec accumulator)

(define (odd-path-visited map start dest)
  ;; nn-wl is (listof Natural)
  ;; node-number worklist; unvisited direct next nodes of the visited nodes
  ;; 
  (local [(define (fn-for-node n nn-wl visited)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(member num visited) (fn-for-lonn nn-wl visited)]
                    [(not (odd? num))     (fn-for-lonn nn-wl visited)]
                    [(= num dest)         (cons num visited)]
                    [else
                     (fn-for-lonn (append nexts nn-wl)
                                  (cons num visited))])))
          
          (define (fn-for-lonn nn-wl visited)
            (cond [(empty? nn-wl) false] 
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl)
                                visited)]))]

    (fn-for-node (generate-node map start) empty empty)))






;;
;; <<< DO NOT EDIT ANYTHING BELOW THIS LINE >>>
;;

(@htdd Map)
;; Map is OPAQUE structure described above.
;;
;; generate-node is a primitive described-above.
;;

(@htdf generate-node)
(@signature Map Natural -> Node)
;; Give map and node number (name), generate corresponding node
(define (generate-node map number)
  (local [(define entry (assoc number (unbox map)))]
    (if (false? entry)
        (error "Node with given number does not exist." number)
        (apply make-node entry))))





(define MAP
  (box '((1 (3 2))
         
         (3 (5 8))
         (2 (4))
         
         (5 (6))
         (8 ())
         (4 ())
         
         (6 ())
         
         (11 (12 15 16))
         (12 (13 14))
         (13 ())
         (14 (12))
         (15 ())
         (16 (17 18))
         (17 ())
         (18 ())
         
         (101 (102 107 108))
         
         (102 (103))
         (107 (103))
         (108 ())
         
         (103 (104 105))
         (109 ())
         
         (104 ())
         (105 (106 109))
         (106 ())
         )))
   
